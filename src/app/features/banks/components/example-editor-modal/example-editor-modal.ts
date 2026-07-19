import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Modal } from '../../../../shared/ui/modal/modal';
import { StatusDot } from '../../../../shared/ui/status-dot/status-dot';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import type {
  AdminBank,
  BankChannelConfig,
  BankExample,
  ChannelKey,
  ExampleRunResult,
  ExpectedResolution,
  ExpectedValues,
  ParseTestResponse,
  SampleMessage,
  UpdateExampleRequest,
} from '../../../../shared/models/bank.models';
import { AdminBanksApiService } from '../../services/admin-banks-api.service';
import { ExpectedValuesForm } from '../expected-values-form/expected-values-form';

const CHANNELS: { key: ChannelKey; label: string }[] = [
  { key: 'mobile', label: 'Móvil' },
  { key: 'email', label: 'Correo' },
  { key: 'desk', label: 'Escritorio' },
];

/**
 * Modal de CRUD de UN ejemplo de banco: crear (canal elegible) o editar (canal
 * inmutable), con ground truth (`ExpectedValuesForm`), prueba contra la config
 * del EDITOR (vía `configProvider`, para iterar reglas sin guardar el banco) y
 * borrado con confirmación. El CRUD usa los endpoints de ejemplos, que son
 * independientes del form del banco: guardar aquí nunca pisa cambios sin
 * guardar del editor.
 */
@Component({
  selector: 'app-example-editor-modal',
  imports: [Alert, Button, Modal, StatusDot, ExpectedValuesForm],
  templateUrl: './example-editor-modal.html',
  styleUrl: './example-editor-modal.scss',
})
export class ExampleEditorModal {
  private readonly api = inject(AdminBanksApiService);
  private readonly notifications = inject(NotificationModalService);
  private readonly destroyRef = inject(DestroyRef);

  readonly channels = CHANNELS;

  readonly open = input(false);
  readonly bankCode = input.required<string>();
  /** Ejemplo a editar; `null` = modo crear. */
  readonly example = input<BankExample | null>(null);
  /** Veredicto del ejemplo contra la config GUARDADA (chip de cabecera). */
  readonly runResult = input<ExampleRunResult | null>(null);
  /** Semilla para el modo crear (p. ej. desde el probador). */
  readonly initialChannel = input<ChannelKey>('mobile');
  readonly initialSample = input<SampleMessage | null>(null);
  /** Config del canal según el EDITOR del banco (sin guardar); null = JSON inválido. */
  readonly configProvider =
    input.required<(ch: ChannelKey) => Partial<BankChannelConfig> | null>();

  readonly saved = output<AdminBank>();
  readonly deleted = output<AdminBank>();
  readonly closed = output<void>();

  // --- Estado del formulario (hidratado al abrir) ---
  readonly channel = signal<ChannelKey>('mobile');
  readonly label = signal('');
  readonly title = signal('');
  readonly body = signal('');
  readonly from = signal('');
  readonly expected = signal<ExpectedValues | null>(null);
  readonly expectMatch = signal(true);
  readonly simulatedAccounts = signal('');
  readonly expectedResolution = signal<ExpectedResolution | ''>('');
  readonly expectedResolvedAccount = signal('');

  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly testing = signal(false);
  readonly testResult = signal<ParseTestResponse | null>(null);
  readonly suggesting = signal(false);
  readonly error = signal('');

  readonly isEditing = computed(() => this.example() !== null);
  readonly channelLabel = computed(
    () => CHANNELS.find((c) => c.key === this.channel())?.label ?? this.channel(),
  );

  /** Cambios sin guardar = el estado actual difiere del hidratado. */
  private readonly baseline = signal('');
  private readonly state = computed(() =>
    JSON.stringify({
      channel: this.channel(),
      label: this.label(),
      title: this.title(),
      body: this.body(),
      from: this.from(),
      expected: this.expected(),
      expectMatch: this.expectMatch(),
      simulatedAccounts: this.simulatedAccounts(),
      expectedResolution: this.expectedResolution(),
      expectedResolvedAccount: this.expectedResolvedAccount(),
    }),
  );
  readonly dirty = computed(() => this.state() !== this.baseline());

  readonly busy = computed(
    () => this.saving() || this.deleting() || this.testing() || this.suggesting(),
  );

  constructor() {
    effect(() => {
      if (this.open()) untracked(() => this.hydrate());
    });
  }

  /** Copia el ejemplo (o la semilla del probador) a los signals del form. */
  private hydrate(): void {
    const ex = this.example();
    if (ex) {
      this.channel.set(ex.channel);
      this.label.set(ex.label ?? '');
      if (ex.channel === 'email') {
        this.title.set(ex.subject ?? '');
        this.body.set(ex.bodyText ?? '');
        this.from.set(ex.from ?? '');
      } else {
        this.title.set(ex.title ?? '');
        // El cuerpo se edita en un solo campo: text + bigText unidos.
        this.body.set([ex.text, ex.bigText].filter(Boolean).join('\n'));
        this.from.set('');
      }
      this.expected.set(ex.expected ?? null);
      this.expectMatch.set(ex.expectMatch !== false);
      this.simulatedAccounts.set((ex.simulatedAccounts ?? []).join('\n'));
      this.expectedResolution.set(ex.expectedResolution ?? '');
      this.expectedResolvedAccount.set(ex.expectedResolvedAccount ?? '');
    } else {
      const seed = this.initialSample();
      this.channel.set(this.initialChannel());
      this.label.set('');
      if (this.initialChannel() === 'email') {
        this.title.set(seed?.subject ?? '');
        this.body.set(seed?.bodyText ?? '');
        this.from.set(seed?.from ?? '');
      } else {
        this.title.set(seed?.title ?? '');
        this.body.set([seed?.text, seed?.bigText].filter(Boolean).join('\n'));
        this.from.set('');
      }
      this.expected.set(null);
      this.expectMatch.set(true);
      this.simulatedAccounts.set('');
      this.expectedResolution.set('');
      this.expectedResolvedAccount.set('');
    }
    this.testResult.set(null);
    this.error.set('');
    this.baseline.set(this.state());
  }

  setChannel(channel: ChannelKey): void {
    if (this.isEditing()) return; // el canal es inmutable al editar
    this.channel.set(channel);
    this.testResult.set(null);
  }

  /** Solicitud de cierre (X, ESC, Cancelar): confirma si hay cambios. */
  async requestClose(): Promise<void> {
    if (this.busy()) return;
    if (this.dirty()) {
      const discard = await this.notifications.confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar en este ejemplo.',
        type: 'warning',
        confirmText: 'Descartar',
      });
      if (!discard) return;
    }
    this.closed.emit();
  }

  private buildSample(): SampleMessage {
    return this.channel() === 'email'
      ? { subject: this.title(), bodyText: this.body(), from: this.from() }
      : { title: this.title(), text: this.body() };
  }

  /** Prueba el mensaje contra la config del EDITOR (mismas reglas que el probador). */
  test(): void {
    const config = this.configProvider()(this.channel());
    if (!config) {
      this.error.set('El JSON de reglas de extracción del editor es inválido.');
      return;
    }
    this.testing.set(true);
    this.error.set('');
    this.api
      .testParse({ channel: this.channel(), sample: this.buildSample(), config })
      .pipe(
        finalize(() => this.testing.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => this.testResult.set(result),
        error: (err) => this.error.set(httpErrorMessage(err)),
      });
  }

  /** La IA propone los valores esperados del mensaje (editable después). */
  suggestExpected(): void {
    this.suggesting.set(true);
    this.error.set('');
    this.api
      .suggestExpected(this.bankCode(), this.channel(), this.buildSample())
      .pipe(
        finalize(() => this.suggesting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.expected.set(response.expected),
        error: (err) => this.error.set(httpErrorMessage(err)),
      });
  }

  save(): void {
    if (this.busy()) return;
    const channel = this.channel();
    const expectMatch = this.expectMatch();
    const expected = this.expected() ?? undefined;
    const label = this.label().trim();
    // Resolución esperada: solo aplica a positivos. `simulatedAccounts` se manda
    // siempre (aun vacío) para poder limpiarla al editar.
    const sims = this.toRawList(this.simulatedAccounts());
    const resolutionValue = this.expectedResolution();
    const resolvedAccount = this.expectedResolvedAccount().trim();
    const resolutionFields = expectMatch
      ? {
          simulatedAccounts: sims,
          ...(resolutionValue ? { expectedResolution: resolutionValue } : {}),
          ...(resolutionValue === 'account' && resolvedAccount
            ? { expectedResolvedAccount: resolvedAccount }
            : {}),
        }
      : {};
    const messageFields =
      channel === 'email'
        ? { subject: this.title(), bodyText: this.body(), from: this.from() }
        : { title: this.title(), text: this.body() };

    const editingId = this.example()?.id ?? null;
    const request$ = editingId
      ? this.api.updateExample(this.bankCode(), editingId, {
          label,
          ...messageFields,
          ...resolutionFields,
          expectMatch,
          // El cuerpo se edita en un solo campo; limpia bigText para no duplicar.
          ...(channel === 'email' ? {} : { bigText: '' }),
          // Si es negativo o se limpió el esperado, mándalo en null (borra).
          expected: expectMatch ? (expected ?? null) : null,
          // '' = limpiar la resolución esperada en el PATCH.
          ...(expectMatch && !resolutionValue ? { expectedResolution: null } : {}),
          ...(resolutionValue !== 'account' ? { expectedResolvedAccount: '' } : {}),
        } satisfies UpdateExampleRequest)
      : this.api.addExample(this.bankCode(), {
          channel,
          ...(label ? { label } : {}),
          ...messageFields,
          ...(expected && expectMatch ? { expected } : {}),
          ...resolutionFields,
          expectMatch,
        });

    this.saving.set(true);
    this.error.set('');
    request$
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.baseline.set(this.state());
          this.saved.emit(response.bank);
        },
        error: (err) => this.error.set(httpErrorMessage(err)),
      });
  }

  async remove(): Promise<void> {
    const editingId = this.example()?.id;
    if (!editingId || this.busy()) return;
    const confirmed = await this.notifications.confirm({
      title: 'Eliminar ejemplo',
      message: 'El ejemplo se borra del banco y deja de validarse. Esta acción no se puede deshacer.',
      type: 'warning',
      confirmText: 'Eliminar',
    });
    if (!confirmed) return;
    this.deleting.set(true);
    this.error.set('');
    this.api
      .removeExample(this.bankCode(), editingId)
      .pipe(
        finalize(() => this.deleting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.deleted.emit(response.bank),
        error: (err) => this.error.set(httpErrorMessage(err)),
      });
  }

  /** Divide por líneas sin forzar minúsculas (números de cuenta tal cual). */
  private toRawList(raw: string): string[] {
    return Array.from(
      new Set(
        (raw ?? '')
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
  }
}
