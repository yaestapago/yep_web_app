import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideRefreshCw, LucideSparkles } from '@lucide/angular';
import { Observable, finalize, of, switchMap, tap } from 'rxjs';

import type {
  ReceiptClassifyResult,
  ReceiptConfirmError,
  ReceiptExample,
  ReceiptExpectedValues,
  ReceiptFieldKey,
  ReceiptIssuer,
  ReceiptTemplate,
  ReceiptTemplateField,
  ReceiptTemplateSummary,
  ReceiptTestResult,
  UpdateReceiptExampleRequest,
} from '../../../../shared/models/receipt-bank.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Checkbox } from '../../../../shared/ui/checkbox/checkbox';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { Select, type SelectOption } from '../../../../shared/ui/select/select';
import { State } from '../../../../shared/ui/state/state';
import { StatusChip } from '../../../../shared/ui/status-chip/status-chip';
import { Toggle } from '../../../../shared/ui/toggle/toggle';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { ReceiptBankApiService } from '../../services/receipt-bank-api.service';
import {
  FIELD_LABELS,
  STATUS_VALUE_OPTIONS,
  TEMPLATE_KIND_LABELS,
  copilotErrorMessage,
  expectedToInput,
  parseCopAmountInput,
  parseExpectedDate,
} from '../../utils/receipt-bank.util';
import { ReceiptFilePreview } from '../receipt-file-preview/receipt-file-preview';
import { ReceiptTestResults } from '../receipt-test-results/receipt-test-results';

const FIELD_HINTS: Partial<Record<ReceiptFieldKey, string>> = {
  amount: 'Escríbelo así: $ 48.000',
  dateTime: 'Escríbela así: 05/07/2026 3:45 pm, o solo el día si no trae hora.',
};

/**
 * Un ejemplo del banco: el comprobante a la izquierda y sus valores esperados a la derecha. Un
 * admin los llena y confirma; lo que proponga la IA solo se aplica con un clic. La confirmación la
 * valida el servidor, y sus errores se muestran junto a cada dato.
 */
@Component({
  selector: 'app-receipt-example-modal',
  imports: [
    DatePipe,
    FormsModule,
    Alert,
    Button,
    Checkbox,
    Input,
    Modal,
    ReceiptFilePreview,
    ReceiptTestResults,
    Select,
    State,
    StatusChip,
    Toggle,
    LucideRefreshCw,
    LucideSparkles,
  ],
  templateUrl: './receipt-example-modal.html',
  styleUrl: './receipt-example-modal.scss',
})
export class ReceiptExampleModal implements OnInit {
  private readonly api = inject(ReceiptBankApiService);
  private readonly notifications = inject(NotificationModalService);
  private readonly destroyRef = inject(DestroyRef);

  readonly exampleId = input.required<string>();
  readonly issuers = input<readonly ReceiptIssuer[]>([]);

  readonly closed = output<void>();
  /** Se guardó, confirmó o borró: las listas deben recargarse. */
  readonly changed = output<void>();
  /** Se creó un emisor o una plantilla desde la propuesta de la IA. */
  readonly catalogChanged = output<void>();

  readonly example = signal<ReceiptExample | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly fileUrl = signal<string | null>(null);
  readonly fileError = signal('');

  // Formulario
  readonly issuerId = signal('');
  readonly templateId = signal('');
  readonly label = signal('');
  readonly expectMatch = signal(true);
  readonly values = signal<Partial<Record<ReceiptFieldKey, string>>>({});
  readonly absent = signal<ReceiptFieldKey[]>([]);
  private readonly baseline = signal('');

  readonly templates = signal<ReceiptTemplateSummary[]>([]);
  readonly template = signal<ReceiptTemplate | null>(null);
  /** Emisores creados aquí, mientras la página vuelve a cargar los suyos. */
  private readonly createdIssuers = signal<ReceiptIssuer[]>([]);

  // Estado de acciones
  readonly saving = signal(false);
  readonly confirming = signal(false);
  readonly working = signal(false);
  readonly fieldErrors = signal<Partial<Record<ReceiptFieldKey, string>>>({});
  readonly error = signal('');
  readonly notice = signal('');

  // IA y prueba
  readonly classifying = signal(false);
  readonly classifyError = signal('');
  readonly proposal = signal<ReceiptClassifyResult | null>(null);
  readonly creatingFromProposal = signal(false);
  readonly testing = signal(false);
  readonly testError = signal('');
  readonly testResult = signal<ReceiptTestResult | null>(null);

  readonly statusOptions = STATUS_VALUE_OPTIONS;
  readonly isConfirmed = computed(() => this.example()?.status === 'confirmed');

  readonly issuerOptions = computed<SelectOption[]>(() => {
    const seen = new Map<string, string>();
    for (const issuer of [...this.issuers(), ...this.createdIssuers()]) {
      seen.set(issuer.id, issuer.isActive ? issuer.name : `${issuer.name} (inactivo)`);
    }
    return [...seen].map(([id, label]) => ({ id, label }));
  });

  readonly templateOptions = computed<SelectOption[]>(() =>
    this.templates().map((template) => ({ id: template.id, label: template.name })),
  );

  /** Datos de la plantilla: primero los requeridos. Un negativo no lleva valores. */
  readonly fields = computed<ReceiptTemplateField[]>(() => {
    if (!this.expectMatch()) return [];
    const fields = this.template()?.draft.fields ?? [];
    return [...fields].sort((a, b) => Number(b.required ?? false) - Number(a.required ?? false));
  });

  private readonly formState = computed(() =>
    JSON.stringify({
      issuerId: this.issuerId(),
      templateId: this.templateId(),
      label: this.label().trim(),
      expectMatch: this.expectMatch(),
      values: this.cleanValues(),
      absent: [...this.absent()].sort(),
    }),
  );
  readonly dirty = computed(() => this.formState() !== this.baseline());

  readonly busy = computed(
    () => this.saving() || this.confirming() || this.working() || this.classifying(),
  );

  /** Por qué no se puede confirmar todavía. Vacío = se puede. El servidor vuelve a validar. */
  readonly confirmBlockReason = computed(() => {
    if (!this.expectMatch()) {
      return this.label().trim()
        ? ''
        : 'Un ejemplo negativo necesita un nombre que diga por qué no debe leerse.';
    }
    if (!this.issuerId()) return 'Escoge el banco emisor.';
    if (!this.templateId()) return 'Escoge el tipo de comprobante.';
    const values = this.values();
    const missing = this.fields()
      .filter((field) => field.required && !(values[field.key] ?? '').trim())
      .map((field) => FIELD_LABELS[field.key]);
    if (missing.length) return `Falta: ${missing.join(', ')}.`;
    return this.fields().some((field) => (values[field.key] ?? '').trim())
      ? ''
      : 'Llena al menos un dato.';
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    const id = this.exampleId();
    this.loading.set(true);
    this.loadError.set('');
    this.api
      .getExample(id)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ example }) => {
          this.applyExample(example);
          this.loadFileUrl();
        },
        error: (error) => this.loadError.set(httpErrorMessage(error)),
      });
  }

  loadFileUrl(): void {
    this.fileError.set('');
    this.fileUrl.set(null);
    this.api
      .exampleFileUrl(this.exampleId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ url }) => this.fileUrl.set(url),
        error: (error) => this.fileError.set(httpErrorMessage(error)),
      });
  }

  /** Copia lo que dice el servidor al formulario. Solo se llama con una respuesta exitosa. */
  private applyExample(example: ReceiptExample): void {
    const previousIssuer = this.issuerId();
    const previousTemplate = this.templateId();
    this.example.set(example);
    this.issuerId.set(example.issuerId ?? '');
    this.templateId.set(example.templateId ?? '');
    this.label.set(example.label ?? '');
    this.expectMatch.set(example.expectMatch);
    this.absent.set(example.absentFields ?? []);
    this.values.set(this.valuesFrom(example.expected));
    this.baseline.set(this.formState());
    if (example.issuerId && example.issuerId !== previousIssuer) this.loadTemplates(example.issuerId);
    if (example.templateId !== null && example.templateId !== previousTemplate) {
      this.loadTemplate(example.templateId);
    }
  }

  private valuesFrom(expected: ReceiptExpectedValues | null): Partial<Record<ReceiptFieldKey, string>> {
    const values: Partial<Record<ReceiptFieldKey, string>> = {};
    for (const key of Object.keys(expected ?? {}) as ReceiptFieldKey[]) {
      values[key] = expectedToInput(key, expected);
    }
    return values;
  }

  private cleanValues(): Partial<Record<ReceiptFieldKey, string>> {
    const clean: Partial<Record<ReceiptFieldKey, string>> = {};
    const values = this.values();
    for (const key of Object.keys(values).sort() as ReceiptFieldKey[]) {
      const value = (values[key] ?? '').trim();
      if (value) clean[key] = value;
    }
    return clean;
  }

  private loadTemplates(issuerId: string): void {
    this.api
      .listTemplates(issuerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ templates }) => {
          if (this.issuerId() === issuerId) this.templates.set(templates);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  private loadTemplate(templateId: string): void {
    this.api
      .getTemplate(templateId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ template }) => {
          if (this.templateId() === templateId) this.template.set(template);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  onIssuerChange(issuerId: string | null): void {
    const next = issuerId ?? '';
    if (next === this.issuerId()) return;
    this.issuerId.set(next);
    this.templateId.set('');
    this.template.set(null);
    this.templates.set([]);
    if (next) this.loadTemplates(next);
  }

  onTemplateChange(templateId: string | null): void {
    const next = templateId ?? '';
    if (next === this.templateId()) return;
    this.templateId.set(next);
    this.template.set(null);
    if (next) this.loadTemplate(next);
  }

  fieldLabel(key: ReceiptFieldKey): string {
    return FIELD_LABELS[key] ?? key;
  }

  fieldHint(key: ReceiptFieldKey): string {
    return FIELD_HINTS[key] ?? '';
  }

  fieldLabels(field: ReceiptTemplateField): string {
    return (field.labels ?? []).join(' · ');
  }

  value(key: ReceiptFieldKey): string {
    return this.values()[key] ?? '';
  }

  setValue(key: ReceiptFieldKey, value: string | null): void {
    this.values.update((current) => ({ ...current, [key]: value ?? '' }));
    this.clearFieldError(key);
  }

  isAbsent(key: ReceiptFieldKey): boolean {
    return this.absent().includes(key);
  }

  /** "Este comprobante no lo muestra": el dato queda sin valor y se verifica que no se lea. */
  setAbsent(key: ReceiptFieldKey, absent: boolean): void {
    this.absent.update((current) =>
      absent ? [...new Set([...current, key])] : current.filter((item) => item !== key),
    );
    if (absent) this.values.update((current) => ({ ...current, [key]: '' }));
    this.clearFieldError(key);
  }

  private clearFieldError(key: ReceiptFieldKey): void {
    if (!this.fieldErrors()[key]) return;
    this.fieldErrors.update((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  /** Arma el PATCH. Un valor mal escrito se marca junto a su campo y no se borra. */
  private buildPatch(): UpdateReceiptExampleRequest | null {
    if (!this.expectMatch()) {
      this.fieldErrors.set({});
      return {
        issuerId: this.issuerId() || null,
        templateId: this.templateId() || null,
        label: this.label().trim() || null,
        expectMatch: false,
        expected: null,
        absentFields: [],
      };
    }

    const errors: Partial<Record<ReceiptFieldKey, string>> = {};
    const expected: ReceiptExpectedValues = {};
    const values = this.cleanValues();
    // Sin plantilla no hay formulario: lo ya guardado se conserva tal cual.
    const keys = this.template()
      ? this.fields().map((field) => field.key)
      : (Object.keys(values) as ReceiptFieldKey[]);
    for (const key of keys) {
      const raw = values[key];
      if (!raw) continue;
      if (key === 'amount') {
        const amount = parseCopAmountInput(raw);
        if (amount === null) errors[key] = 'No entendimos este monto. Escríbelo así: $ 48.000';
        else expected[key] = amount;
      } else if (key === 'dateTime') {
        const date = parseExpectedDate(raw);
        if (date === null) {
          errors[key] = 'No entendimos esta fecha. Escríbela así: 05/07/2026 3:45 pm';
        } else {
          expected[key] = date;
        }
      } else {
        expected[key] = raw;
      }
    }
    this.fieldErrors.set(errors);
    if (Object.keys(errors).length) return null;

    return {
      issuerId: this.issuerId() || null,
      templateId: this.templateId() || null,
      label: this.label().trim() || null,
      expectMatch: true,
      expected: Object.keys(expected).length ? expected : null,
      absentFields: this.absent(),
    };
  }

  save(): void {
    if (this.busy() || this.isConfirmed()) return;
    const patch = this.buildPatch();
    if (!patch) return;
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    this.api
      .updateExample(this.exampleId(), patch)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ example }) => {
          this.applyExample(example);
          this.notice.set('Guardamos el borrador. Todavía no cuenta como ejemplo: falta confirmarlo.');
          this.changed.emit();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  /** Guarda lo escrito y confirma. El servidor valida y registra quién y cuándo. */
  confirm(): void {
    if (this.busy() || this.isConfirmed() || this.confirmBlockReason()) return;
    const patch = this.buildPatch();
    if (!patch) return;
    const id = this.exampleId();
    this.confirming.set(true);
    this.error.set('');
    this.notice.set('');
    const save$: Observable<unknown> = this.dirty()
      ? this.api.updateExample(id, patch).pipe(tap(({ example }) => this.applyExample(example)))
      : of(null);
    save$
      .pipe(
        switchMap(() => this.api.confirmExample(id)),
        finalize(() => this.confirming.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ example }) => {
          this.applyExample(example);
          this.notice.set('Ejemplo confirmado. Ya cuenta para probar y aprobar la plantilla.');
          this.changed.emit();
        },
        error: (error) => this.showConfirmError(error),
      });
  }

  /** El 400 trae `missingFields`, `requiredAbsent` y `contradictory`: cada uno va junto a su dato. */
  private showConfirmError(error: unknown): void {
    const body = (error instanceof HttpErrorResponse ? error.error : null) as ReceiptConfirmError | null;
    const errors: Partial<Record<ReceiptFieldKey, string>> = {};
    for (const key of body?.missingFields ?? []) {
      errors[key] = 'Falta este dato: es requerido en esta plantilla.';
    }
    for (const key of body?.requiredAbsent ?? []) {
      errors[key] = 'Este dato es requerido: no lo puedes marcar como "no lo muestra".';
    }
    for (const key of body?.contradictory ?? []) {
      errors[key] = 'Tiene valor y también está marcado como "no lo muestra". Deja solo uno.';
    }
    this.fieldErrors.set(errors);

    const shown = new Set(this.fields().map((field) => field.key));
    const others = (Object.keys(errors) as ReceiptFieldKey[]).filter((key) => !shown.has(key));
    const message = httpErrorMessage(error);
    this.error.set(
      others.length
        ? `${message} También: ${others.map((key) => this.fieldLabel(key)).join(', ')}.`
        : message,
    );
  }

  reopen(): void {
    this.runAction(this.api.reopenExample(this.exampleId()), 'El ejemplo volvió a borrador.');
  }

  reocr(): void {
    this.runAction(this.api.reocrExample(this.exampleId()), 'Leímos de nuevo el comprobante.');
  }

  private runAction(request$: Observable<{ example: ReceiptExample }>, notice: string): void {
    if (this.busy()) return;
    this.working.set(true);
    this.error.set('');
    this.notice.set('');
    request$
      .pipe(
        finalize(() => this.working.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ example }) => {
          this.applyExample(example);
          this.testResult.set(null);
          this.notice.set(notice);
          this.changed.emit();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  async remove(): Promise<void> {
    if (this.busy()) return;
    const confirmed = await this.notifications.confirm({
      title: 'Eliminar ejemplo',
      message: 'Borramos el ejemplo y su imagen. No se puede deshacer.',
      type: 'warning',
      confirmText: 'Eliminar',
    });
    if (!confirmed) return;
    this.working.set(true);
    this.error.set('');
    this.api
      .deleteExample(this.exampleId())
      .pipe(
        finalize(() => this.working.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.changed.emit();
          this.closed.emit();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  async close(): Promise<void> {
    if (this.busy()) return;
    if (this.dirty()) {
      const discard = await this.notifications.confirm({
        title: 'Descartar cambios',
        message: 'Tienes datos sin guardar en este ejemplo.',
        type: 'warning',
        confirmText: 'Descartar',
      });
      if (!discard) return;
    }
    this.closed.emit();
  }

  // --- IA: propone; solo se aplica con un clic --------------------------------

  classify(): void {
    if (this.busy()) return;
    this.classifying.set(true);
    this.classifyError.set('');
    this.proposal.set(null);
    this.api
      .classifyExample(this.exampleId())
      .pipe(
        switchMap(({ jobId }) => this.api.waitForJob<ReceiptClassifyResult>(jobId)),
        finalize(() => this.classifying.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => this.proposal.set(result),
        error: (error) => this.classifyError.set(copilotErrorMessage(error)),
      });
  }

  templateKindLabel(kind: string): string {
    return TEMPLATE_KIND_LABELS[kind as keyof typeof TEMPLATE_KIND_LABELS] ?? kind;
  }

  percent(confidence: number | undefined): string {
    return `${Math.round((confidence ?? 0) * 100)} %`;
  }

  /** Usa el emisor propuesto. Si no existe, lo crea con un clic del admin. */
  useProposedIssuer(): void {
    const issuer = this.proposal()?.issuer;
    if (!issuer || this.creatingFromProposal()) return;
    if (issuer.existingIssuerId) {
      this.onIssuerChange(issuer.existingIssuerId);
      return;
    }
    this.creatingFromProposal.set(true);
    this.classifyError.set('');
    this.api
      .createIssuer({ code: issuer.code, name: issuer.name })
      .pipe(
        finalize(() => this.creatingFromProposal.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ issuer: created }) => {
          this.createdIssuers.update((current) => [...current, created]);
          this.onIssuerChange(created.id);
          this.catalogChanged.emit();
        },
        error: (error) => this.classifyError.set(httpErrorMessage(error)),
      });
  }

  /** Usa la plantilla propuesta. Si no existe, la crea en borrador con un clic del admin. */
  useProposedTemplate(): void {
    const proposal = this.proposal();
    const proposed = proposal?.template;
    if (!proposal || !proposed || this.creatingFromProposal()) return;
    if (proposed.existingTemplateId) {
      // Una plantilla pertenece a un emisor: se aplican juntos para que el servidor no los rechace.
      const proposedIssuer = proposal.issuer?.existingIssuerId;
      if (proposedIssuer) this.onIssuerChange(proposedIssuer);
      this.onTemplateChange(proposed.existingTemplateId);
      return;
    }
    const issuerId = this.issuerId();
    if (!issuerId) return;
    this.creatingFromProposal.set(true);
    this.classifyError.set('');
    this.api
      .createTemplate(issuerId, {
        code: proposed.suggestedCode,
        name: proposed.suggestedName,
        kind: proposed.kind,
        medium: proposed.medium,
        draft: { fields: proposal.fields, detection: proposal.detection ?? undefined },
      })
      .pipe(
        finalize(() => this.creatingFromProposal.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ template }) => {
          this.loadTemplates(issuerId);
          this.templateId.set(template.id);
          this.template.set(template);
          this.catalogChanged.emit();
        },
        error: (error) => this.classifyError.set(httpErrorMessage(error)),
      });
  }

  // --- Probar -----------------------------------------------------------------

  runTest(): void {
    const templateId = this.templateId();
    if (!templateId || this.testing()) return;
    this.testing.set(true);
    this.testError.set('');
    this.api
      .testTemplate(templateId)
      .pipe(
        finalize(() => this.testing.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => this.testResult.set(result),
        error: (error) => this.testError.set(httpErrorMessage(error)),
      });
  }
}
