import { DatePipe, JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideArrowLeft, LucidePlus, LucideSparkles, LucideX } from '@lucide/angular';
import { Observable, finalize, switchMap } from 'rxjs';

import type {
  ReceiptApprovalConflict,
  ReceiptDefinition,
  ReceiptExample,
  ReceiptFieldKey,
  ReceiptMedium,
  ReceiptRulesResult,
  ReceiptTemplate,
  ReceiptTemplateKind,
  ReceiptTestResult,
  ReceiptValueFormat,
} from '../../../../shared/models/receipt-bank.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Card } from '../../../../shared/ui/card/card';
import { CardSection } from '../../../../shared/ui/card-section/card-section';
import { IconButton } from '../../../../shared/ui/icon-button/icon-button';
import { Input } from '../../../../shared/ui/input/input';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { Select } from '../../../../shared/ui/select/select';
import { State } from '../../../../shared/ui/state/state';
import { StatusChip } from '../../../../shared/ui/status-chip/status-chip';
import { Toggle } from '../../../../shared/ui/toggle/toggle';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { ReceiptBankApiService } from '../../services/receipt-bank-api.service';
import {
  FIELD_LABELS,
  FIELD_OPTIONS,
  MEDIUM_OPTIONS,
  TEMPLATE_KIND_OPTIONS,
  VALUE_FORMAT_OPTIONS,
  blockerMessage,
  copilotErrorMessage,
  linesToList,
  templateStatusChips,
} from '../../utils/receipt-bank.util';
import { ExamplesList } from '../examples-list/examples-list';
import { ReceiptTestResults } from '../receipt-test-results/receipt-test-results';

/** Una fila del editor de datos esperados. Los labels se editan uno por línea. */
export interface EditorField {
  key: ReceiptFieldKey;
  required: boolean;
  labels: string;
  valueFormat: ReceiptValueFormat;
  notes: string;
}

const DEFAULT_FORMATS: Partial<Record<ReceiptFieldKey, ReceiptValueFormat>> = {
  amount: 'money',
  dateTime: 'datetime',
  reference: 'reference',
  senderName: 'name',
  receiverName: 'name',
  senderAccount: 'account',
  receiverAccount: 'account',
};

/** Lo que el flujo de validación necesita de un comprobante. */
const FLOW_FIELDS: ReceiptFieldKey[] = ['amount', 'receiverAccount', 'reference', 'dateTime'];

/**
 * Detalle de una plantilla: un tipo de comprobante de un banco emisor. Se edita el borrador; lo
 * aprobado no cambia hasta aprobar de nuevo. La IA solo propone: "Cargar en el editor" llena el
 * formulario y nada se guarda sin que un admin lo decida.
 */
@Component({
  selector: 'app-template-editor',
  imports: [
    DatePipe,
    JsonPipe,
    FormsModule,
    Alert,
    Button,
    Card,
    CardSection,
    ExamplesList,
    IconButton,
    Input,
    ReceiptTestResults,
    Select,
    State,
    StatusChip,
    Toggle,
    LucideArrowLeft,
    LucidePlus,
    LucideSparkles,
  ],
  templateUrl: './template-editor.html',
  styleUrl: './template-editor.scss',
})
export class TemplateEditor implements OnInit {
  private readonly api = inject(ReceiptBankApiService);
  private readonly notifications = inject(NotificationModalService);
  private readonly destroyRef = inject(DestroyRef);

  readonly templateId = input.required<string>();
  readonly issuerName = input('');
  /** Sube este número para recargar los ejemplos. */
  readonly examplesRefreshKey = input(0);

  readonly back = output<void>();
  /** La plantilla cambió: la página recarga conteos y lista. */
  readonly changed = output<void>();
  readonly deleted = output<void>();
  readonly promptRequested = output<void>();
  readonly openExample = output<string>();
  readonly exampleUploaded = output<ReceiptExample>();

  readonly removeIcon = LucideX;
  readonly kindOptions = TEMPLATE_KIND_OPTIONS;
  readonly mediumOptions = MEDIUM_OPTIONS;
  readonly fieldOptions = FIELD_OPTIONS;
  readonly formatOptions = VALUE_FORMAT_OPTIONS;

  readonly template = signal<ReceiptTemplate | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal('');

  // Formulario
  readonly name = signal('');
  readonly kind = signal<ReceiptTemplateKind>('other');
  readonly medium = signal<ReceiptMedium>('app_screenshot');
  readonly fields = signal<EditorField[]>([]);
  readonly allOf = signal('');
  readonly anyOf = signal('');
  readonly noneOf = signal('');
  readonly minAnyOf = signal('0');
  readonly rulesText = signal('{}');
  private readonly baseline = signal('');
  private readonly definitionBaseline = signal('');

  // Acciones
  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly working = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  // Prueba
  readonly testResult = signal<ReceiptTestResult | null>(null);
  readonly testError = signal('');
  private readonly testedDefinition = signal('');

  // Aprobar
  readonly approving = signal(false);
  readonly approvalMessage = signal('');
  readonly approvalBlockers = signal<string[]>([]);
  readonly approvalResult = signal<ReceiptTestResult | null>(null);

  // Copiloto
  readonly copilotRunning = signal<'suggest' | 'repair' | null>(null);
  readonly copilotError = signal('');
  readonly proposal = signal<ReceiptRulesResult | null>(null);

  readonly statusChips = computed(() => {
    const template = this.template();
    return template ? templateStatusChips(template.status, template.hasUnapprovedChanges) : [];
  });

  /** Las reglas se escriben como JSON; aquí se avisa si no se pueden leer. */
  readonly rulesError = computed(() => {
    const text = this.rulesText().trim();
    if (!text) return '';
    try {
      const parsed: unknown = JSON.parse(text);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? ''
        : 'Las reglas deben ser un objeto JSON.';
    } catch {
      return 'Este JSON tiene un error. Revísalo antes de probar o guardar.';
    }
  });

  readonly duplicateFieldError = computed(() => {
    const keys = this.fields().map((field) => field.key);
    return new Set(keys).size === keys.length ? '' : 'Cada dato puede ir una sola vez.';
  });

  readonly formError = computed(() => this.rulesError() || this.duplicateFieldError());

  /** Definición del editor. `null` si el JSON de reglas no se puede leer. */
  private readonly definition = computed<ReceiptDefinition | null>(() => {
    if (this.rulesError()) return null;
    const text = this.rulesText().trim();
    return {
      fields: this.fields().map((field) => ({
        key: field.key,
        required: field.required,
        labels: linesToList(field.labels),
        valueFormat: field.valueFormat,
        ...(field.notes.trim() ? { notes: field.notes.trim() } : {}),
      })),
      detection: {
        allOf: linesToList(this.allOf()),
        anyOf: linesToList(this.anyOf()),
        noneOf: linesToList(this.noneOf()),
        minAnyOf: this.minAnyOfValue(),
      },
      rules: text ? (JSON.parse(text) as Record<string, unknown>) : {},
    };
  });

  private readonly definitionState = computed(
    () => JSON.stringify(this.definition()) + this.rulesText(),
  );

  private readonly formState = computed(() =>
    JSON.stringify({
      name: this.name().trim(),
      kind: this.kind(),
      medium: this.medium(),
      definition: this.definitionState(),
    }),
  );

  readonly dirty = computed(() => this.formState() !== this.baseline());

  readonly busy = computed(
    () =>
      this.saving() ||
      this.testing() ||
      this.approving() ||
      this.working() ||
      this.copilotRunning() !== null,
  );

  /** Datos que el flujo pide por WhatsApp si el comprobante no los trae. */
  readonly optionalFlowFields = computed(() => {
    const required = new Set(this.fields().filter((f) => f.required).map((f) => f.key));
    return FLOW_FIELDS.filter((key) => !required.has(key)).map((key) => FIELD_LABELS[key]);
  });

  readonly weakDetection = computed(
    () => linesToList(this.allOf()).length + this.minAnyOfValue() < 2,
  );

  readonly weakDetectionMessage = blockerMessage('weak_detection');

  /** Por qué no se puede pedir reparar. La IA repara lo guardado, no lo que hay en el editor. */
  readonly repairBlockReason = computed(() =>
    this.dirty() ? 'Guarda primero: la IA repara las reglas guardadas.' : '',
  );

  /** Por qué no se puede aprobar. Vacío = se puede intentar; el servidor recalcula todo. */
  readonly approveBlockReason = computed(() => {
    if (this.dirty()) return 'Guarda los cambios antes de aprobar: se aprueba lo guardado.';
    const tested = this.testResult();
    if (tested && !tested.canApprove && this.testedDefinition() === this.definitionState()) {
      return 'La última prueba no permite aprobar. Mira los motivos.';
    }
    return '';
  });

  readonly canApproveAgain = computed(() => {
    const template = this.template();
    return (
      template !== null &&
      template.status !== 'disabled' &&
      (template.status !== 'approved' || template.hasUnapprovedChanges)
    );
  });

  readonly testBlockers = computed(() => this.testResult()?.blockers.map(blockerMessage) ?? []);
  readonly approvalBlockerMessages = computed(() => this.approvalBlockers().map(blockerMessage));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api
      .getTemplate(this.templateId())
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ template }) => this.hydrate(template),
        error: (error) => this.loadError.set(httpErrorMessage(error)),
      });
  }

  private hydrate(template: ReceiptTemplate): void {
    this.template.set(template);
    this.name.set(template.name);
    this.kind.set(template.kind);
    this.medium.set(template.medium);
    const draft = template.draft ?? {};
    this.fields.set(
      (draft.fields ?? []).map((field) => ({
        key: field.key,
        required: field.required ?? false,
        labels: (field.labels ?? []).join('\n'),
        valueFormat: field.valueFormat,
        notes: field.notes ?? '',
      })),
    );
    this.setDetection(draft.detection);
    this.rulesText.set(JSON.stringify(draft.rules ?? {}, null, 2));
    this.baseline.set(this.formState());
    this.definitionBaseline.set(this.definitionState());
  }

  private setDetection(detection: ReceiptDefinition['detection']): void {
    this.allOf.set((detection?.allOf ?? []).join('\n'));
    this.anyOf.set((detection?.anyOf ?? []).join('\n'));
    this.noneOf.set((detection?.noneOf ?? []).join('\n'));
    this.minAnyOf.set(String(detection?.minAnyOf ?? 0));
  }

  private minAnyOfValue(): number {
    const value = Number.parseInt(this.minAnyOf(), 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  // --- Datos esperados --------------------------------------------------------

  addField(): void {
    const used = new Set(this.fields().map((field) => field.key));
    const key = FIELD_OPTIONS.map((option) => option.id as ReceiptFieldKey).find((id) => !used.has(id));
    if (!key) return;
    this.fields.update((current) => [
      ...current,
      { key, required: false, labels: '', valueFormat: DEFAULT_FORMATS[key] ?? 'text', notes: '' },
    ]);
  }

  removeField(index: number): void {
    this.fields.update((current) => current.filter((_, position) => position !== index));
  }

  updateField(index: number, patch: Partial<EditorField>): void {
    this.fields.update((current) =>
      current.map((field, position) => (position === index ? { ...field, ...patch } : field)),
    );
  }

  /** Al cambiar de dato se sugiere su formato. */
  setFieldKey(index: number, key: ReceiptFieldKey): void {
    this.updateField(index, { key, valueFormat: DEFAULT_FORMATS[key] ?? 'text' });
  }

  // --- Guardar ----------------------------------------------------------------

  async save(): Promise<void> {
    const definition = this.definition();
    if (this.busy() || !definition || this.formError() || !this.name().trim()) return;
    const template = this.template();
    const definitionChanged = this.definitionState() !== this.definitionBaseline();
    if (template?.status === 'approved' && definitionChanged) {
      const accepted = await this.notifications.confirm({
        title: 'La plantilla vuelve a borrador',
        message:
          'Si guardas estos cambios, deja de correr en vivo hasta que la apruebes otra vez. La versión aprobada queda como registro.',
        type: 'warning',
        confirmText: 'Guardar',
      });
      if (!accepted) return;
    }
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    this.api
      .updateTemplate(this.templateId(), {
        name: this.name().trim(),
        kind: this.kind(),
        medium: this.medium(),
        draft: definition,
      })
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ template: saved }) => {
          this.hydrate(saved);
          this.notice.set('Guardamos el borrador.');
          this.changed.emit();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  // --- Probar -----------------------------------------------------------------

  /** Prueba lo que hay en el editor contra los ejemplos confirmados. No guarda. */
  runTest(): void {
    const definition = this.definition();
    if (this.busy() || !definition || this.formError()) return;
    const tested = this.definitionState();
    this.testing.set(true);
    this.testError.set('');
    this.api
      .testTemplate(this.templateId(), definition)
      .pipe(
        finalize(() => this.testing.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.testResult.set(result);
          this.testedDefinition.set(tested);
        },
        error: (error) => this.testError.set(httpErrorMessage(error)),
      });
  }

  // --- Copiloto ---------------------------------------------------------------

  generateRules(): void {
    this.runCopilot('suggest', this.api.suggestRules(this.templateId()));
  }

  repairRules(): void {
    if (this.repairBlockReason()) return;
    this.runCopilot('repair', this.api.repairRules(this.templateId()));
  }

  private runCopilot(mode: 'suggest' | 'repair', start$: Observable<{ jobId: string }>): void {
    if (this.busy()) return;
    this.copilotRunning.set(mode);
    this.copilotError.set('');
    this.proposal.set(null);
    this.notice.set('');
    start$
      .pipe(
        switchMap(({ jobId }) => this.api.waitForJob<ReceiptRulesResult>(jobId)),
        finalize(() => this.copilotRunning.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => this.proposal.set(result),
        error: (error) => this.copilotError.set(copilotErrorMessage(error)),
      });
  }

  /** Solo llena el formulario. Nada cambia en la plantilla hasta guardar y aprobar. */
  loadProposal(): void {
    const proposal = this.proposal();
    if (!proposal) return;
    this.rulesText.set(JSON.stringify(proposal.proposed.rules ?? {}, null, 2));
    if (proposal.proposed.detection) this.setDetection(proposal.proposed.detection);
    this.proposal.set(null);
    this.notice.set(
      this.template()?.status === 'approved'
        ? 'Propuesta cargada, sin guardar. Si la guardas, la plantilla vuelve a borrador y deja de correr en vivo hasta aprobarla otra vez.'
        : 'Propuesta cargada, sin guardar. Pruébala y guárdala si te sirve.',
    );
  }

  discardProposal(): void {
    this.proposal.set(null);
  }

  shortId(id: string): string {
    return id.slice(-6);
  }

  fieldNames(keys: ReceiptFieldKey[]): string {
    return keys.map((key) => FIELD_LABELS[key] ?? key).join(', ');
  }

  blockerText(blocker: string): string {
    return blockerMessage(blocker);
  }

  cost(value: number | undefined): string {
    return value === undefined ? '' : `US$ ${value.toFixed(3)}`;
  }

  // --- Aprobar, desactivar, activar, borrar ------------------------------------

  approve(): void {
    if (this.busy() || this.approveBlockReason()) return;
    this.approving.set(true);
    this.runStatusChange(
      this.api.approveTemplate(this.templateId()),
      'Plantilla aprobada. Se usa en vivo cuando la lectura por reglas está activa.',
      () => this.approving.set(false),
    );
  }

  enable(): void {
    if (this.busy()) return;
    this.working.set(true);
    this.runStatusChange(
      this.api.enableTemplate(this.templateId()),
      'Plantilla activada de nuevo.',
      () => this.working.set(false),
    );
  }

  disable(): void {
    if (this.busy()) return;
    this.working.set(true);
    this.runStatusChange(
      this.api.disableTemplate(this.templateId()),
      'Plantilla desactivada. Ya no se usa en vivo.',
      () => this.working.set(false),
    );
  }

  private runStatusChange(
    request$: Observable<{ template: ReceiptTemplate }>,
    notice: string,
    done: () => void,
  ): void {
    this.error.set('');
    this.notice.set('');
    this.clearApproval();
    request$
      .pipe(finalize(done), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ template }) => {
          this.hydrate(template);
          this.notice.set(notice);
          this.changed.emit();
        },
        error: (error) => this.showApprovalError(error),
      });
  }

  /** El 409 trae los `blockers` y a veces el resultado de la prueba, sin valores. */
  private showApprovalError(error: unknown): void {
    const body = (error instanceof HttpErrorResponse ? error.error : null) as ReceiptApprovalConflict | null;
    this.approvalMessage.set(httpErrorMessage(error));
    this.approvalBlockers.set(body?.blockers ?? []);
    this.approvalResult.set(body?.result ?? null);
  }

  private clearApproval(): void {
    this.approvalMessage.set('');
    this.approvalBlockers.set([]);
    this.approvalResult.set(null);
  }

  async remove(): Promise<void> {
    if (this.busy()) return;
    const accepted = await this.notifications.confirm({
      title: 'Eliminar plantilla',
      message: 'Solo se puede borrar si nunca se aprobó y no tiene ejemplos. No se puede deshacer.',
      type: 'warning',
      confirmText: 'Eliminar',
    });
    if (!accepted) return;
    this.working.set(true);
    this.error.set('');
    this.api
      .deleteTemplate(this.templateId())
      .pipe(
        finalize(() => this.working.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.deleted.emit(),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  /** ¿Se puede salir de la plantilla? Pide confirmar si hay cambios sin guardar. */
  async canLeave(): Promise<boolean> {
    if (!this.dirty()) return true;
    return this.notifications.confirm({
      title: 'Descartar cambios',
      message: 'Tienes cambios sin guardar en esta plantilla.',
      type: 'warning',
      confirmText: 'Descartar',
    });
  }

  async goBack(): Promise<void> {
    if (await this.canLeave()) this.back.emit();
  }
}
