import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input as defineInput,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideBell,
  LucideCheck,
  LucideFileText,
  LucideImage,
  LucideLoaderCircle,
  LucideMail,
  LucideMessageSquare,
  LucideSmartphone,
  LucideTriangleAlert,
  LucideUserCheck,
  LucideX,
} from '@lucide/angular';
import { finalize } from 'rxjs';

import { Modal } from '../../../../shared/ui/modal/modal';
import type {
  DataRequestEntry,
  MissingField,
  PaymentSupport,
  PaymentSupportType,
  PaymentTransaction,
} from '../../../../shared/models/transaction.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import {
  transactionStatusLabel,
  transactionTone,
  validationMethod,
  validationMethodLabel,
  verificationLevelLabel,
} from '../../../../shared/utils/transaction-status';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';

/** Un soporte manual sintético (confirmación humana o dato completado). */
interface ManualEntry {
  label: string;
  detail: string;
}

const SUPPORT_TYPE_LABELS: Record<PaymentSupportType, string> = {
  OCR_RECEIPT: 'Comprobante de pago',
  BANK_SMS: 'SMS bancario',
  BANK_WEBHOOK: 'Webhook bancario',
  BANK_STATEMENT: 'Extracto bancario',
  MANUAL_ENTRY: 'Registro manual',
};

const EVENT_SOURCE_LABELS: Record<string, string> = {
  EMAIL_GMAIL: 'Correo bancario',
  NOTIFIER_APP: 'Notificador móvil',
  BANK_SMS: 'SMS bancario',
  BANK_WEBHOOK: 'Webhook bancario',
  WHATSAPP_INBOUND: 'Comprobante por WhatsApp',
  MANUAL_ENTRY: 'Registro manual',
};

const MISSING_FIELD_LABELS: Record<MissingField, string> = {
  amount: 'Monto',
  receiverAccount: 'Cuenta de destino',
  reference: 'Número de comprobante',
  transactionDate: 'Fecha y hora',
};

const MISSING_FIELD_PLACEHOLDERS: Record<MissingField, string> = {
  amount: 'Ej. 50000',
  receiverAccount: 'Número de cuenta',
  reference: 'Número de referencia',
  transactionDate: 'Ej. 2026-07-05 14:30',
};

/**
 * Modal de detalle de una transacción: resumen (con quién la generó), cómo se
 * validó, soportes relacionados (eventos bancarios enlazados + comprobante de
 * pago + confirmaciones manuales) y auditoría. Si a la transacción le faltó un
 * dato del OCR (NEEDS_INPUT), ofrece completarlo aquí mismo.
 */
@Component({
  selector: 'app-transaction-detail-modal',
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    Modal,
    LucideBell,
    LucideCheck,
    LucideFileText,
    LucideImage,
    LucideLoaderCircle,
    LucideMail,
    LucideMessageSquare,
    LucideSmartphone,
    LucideTriangleAlert,
    LucideUserCheck,
    LucideX,
  ],
  templateUrl: './transaction-detail-modal.html',
  styleUrl: './transaction-detail-modal.scss',
})
export class TransactionDetailModal {
  private readonly api = inject(TransactionsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly transaction = defineInput<PaymentTransaction | null>(null);
  readonly close = output<void>();
  /** Pide a la sección padre abrir el detalle de un evento (por su id). */
  readonly viewSourceEvent = output<string>();
  /** Emite la transacción actualizada tras completar datos faltantes. */
  readonly updated = output<PaymentTransaction>();

  readonly open = computed(() => this.transaction() !== null);

  readonly supports = signal<PaymentSupport[]>([]);
  readonly loadingSupports = signal(false);
  readonly supportsError = signal('');

  // Foto del comprobante (lightbox).
  readonly receiptUrl = signal<string | null>(null);
  readonly loadingReceiptId = signal<string | null>(null);
  readonly receiptError = signal('');

  // Formulario para completar datos faltantes (NEEDS_INPUT).
  readonly formValues = signal<Partial<Record<MissingField, string>>>({});
  readonly submitting = signal(false);
  readonly completeError = signal('');

  private loadedId: string | null = null;

  constructor() {
    effect(() => {
      const transaction = this.transaction();
      if (!transaction) {
        this.loadedId = null;
        this.supports.set([]);
        this.supportsError.set('');
        this.resetReceipt();
        return;
      }
      if (transaction.id === this.loadedId) {
        return;
      }
      this.loadedId = transaction.id;
      this.formValues.set({});
      this.completeError.set('');
      this.resetReceipt();
      this.loadSupports(transaction.id);
    });
  }

  readonly method = computed(() => {
    const transaction = this.transaction();
    return transaction
      ? validationMethod(transaction.status, transaction.verification.level)
      : 'pendiente';
  });

  readonly methodLabel = computed(() => validationMethodLabel(this.method()));

  readonly needsInput = computed(() => this.transaction()?.status === 'NEEDS_INPUT');

  readonly missingFields = computed<MissingField[]>(
    () => this.transaction()?.dataRequest?.missingFields ?? [],
  );

  /** Eventos bancarios enlazados, con etiqueta amigable y clickeables. */
  readonly relatedEvents = computed(() => {
    const transaction = this.transaction();
    return (transaction?.events ?? []).map((event) => ({
      eventId: event.eventId,
      sourceType: event.sourceType,
      label: EVENT_SOURCE_LABELS[event.sourceType] ?? event.source,
      linkedAt: event.linkedAt,
    }));
  });

  /** Confirmaciones manuales y datos completados por el staff (sintéticos). */
  readonly manualEntries = computed<ManualEntry[]>(() => {
    const transaction = this.transaction();
    if (!transaction) {
      return [];
    }
    const entries: ManualEntry[] = [];
    const review = transaction.manualReview;
    if (review) {
      const who = review.byUserName || 'Usuario';
      const when = new Date(review.at).toLocaleString();
      entries.push({
        label:
          review.decision === 'confirmed'
            ? 'Confirmación manual'
            : 'Rechazo manual',
        detail: `${who} · ${when}${review.note ? ` · ${review.note}` : ''}`,
      });
    }
    for (const item of transaction.dataRequest?.history ?? []) {
      entries.push({
        label: `Dato completado: ${MISSING_FIELD_LABELS[item.field]}`,
        detail: this.dataEntryDetail(item),
      });
    }
    return entries;
  });

  /** ¿Hay algo que mostrar en "Soportes relacionados"? */
  readonly hasRelated = computed(
    () =>
      this.relatedEvents().length > 0 ||
      this.supports().length > 0 ||
      this.manualEntries().length > 0,
  );

  statusLabel(transaction: PaymentTransaction): string {
    return transactionStatusLabel(transaction.status);
  }

  tone(transaction: PaymentTransaction): string {
    return transactionTone(transaction.status);
  }

  levelLabel(transaction: PaymentTransaction): string {
    return verificationLevelLabel(transaction.verification.level);
  }

  sender(transaction: PaymentTransaction): string {
    return (
      transaction.sender?.name?.trim() ||
      transaction.sender?.account?.trim() ||
      'No registrado'
    );
  }

  supportLabel(type: PaymentSupportType): string {
    return SUPPORT_TYPE_LABELS[type] ?? type;
  }

  fieldLabel(field: MissingField): string {
    return MISSING_FIELD_LABELS[field];
  }

  fieldPlaceholder(field: MissingField): string {
    return MISSING_FIELD_PLACEHOLDERS[field];
  }

  /** Un soporte con imagen adjunta puede abrirse como foto. */
  hasPhoto(support: PaymentSupport): boolean {
    return support.type === 'OCR_RECEIPT' || Boolean(support.file);
  }

  // --- Foto del comprobante -------------------------------------------------

  openReceipt(support: PaymentSupport): void {
    if (this.loadingReceiptId()) {
      return;
    }
    this.receiptError.set('');
    this.loadingReceiptId.set(support.id);
    this.api
      .getSupportFileUrl(support.id)
      .pipe(
        finalize(() => this.loadingReceiptId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          if (response.url) {
            this.receiptUrl.set(response.url);
          } else {
            this.receiptError.set('La imagen del comprobante no está disponible.');
          }
        },
        error: (error) => this.receiptError.set(httpErrorMessage(error)),
      });
  }

  closeReceipt(): void {
    this.receiptUrl.set(null);
  }

  private resetReceipt(): void {
    this.receiptUrl.set(null);
    this.loadingReceiptId.set(null);
    this.receiptError.set('');
  }

  // --- Completar datos faltantes -------------------------------------------

  formValue(field: MissingField): string {
    return this.formValues()[field] ?? '';
  }

  setFormValue(field: MissingField, value: string): void {
    this.formValues.set({ ...this.formValues(), [field]: value });
  }

  readonly canSubmit = computed(() =>
    this.missingFields().some((field) => (this.formValues()[field] ?? '').trim()),
  );

  submitCompleteData(): void {
    const transaction = this.transaction();
    if (!transaction || this.submitting() || !this.canSubmit()) {
      return;
    }
    const values = this.formValues();
    const payload: Partial<Record<MissingField, string>> = {};
    for (const field of this.missingFields()) {
      const value = (values[field] ?? '').trim();
      if (value) {
        payload[field] = value;
      }
    }
    this.submitting.set(true);
    this.completeError.set('');
    this.api
      .completeData(transaction.id, payload)
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          if (response.rejected.length > 0) {
            this.completeError.set(
              `No se pudo interpretar: ${response.rejected
                .map((field) => this.fieldLabel(field))
                .join(', ')}.`,
            );
          }
          this.formValues.set({});
          // Refrescamos el detalle con la transacción actualizada y avisamos a
          // la sección para que recargue la lista.
          this.loadedId = null;
          this.updated.emit(response.transaction);
        },
        error: (error) => this.completeError.set(httpErrorMessage(error)),
      });
  }

  private loadSupports(transactionId: string): void {
    this.loadingSupports.set(true);
    this.supportsError.set('');
    this.api
      .listSupports(transactionId)
      .pipe(
        finalize(() => this.loadingSupports.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.supports.set(response.paymentSupports),
        error: (error) => this.supportsError.set(httpErrorMessage(error)),
      });
  }

  private dataEntryDetail(item: DataRequestEntry): string {
    const who = item.byName || 'Staff';
    const via = item.via === 'whatsapp' ? 'WhatsApp' : 'módulo';
    const when = new Date(item.at).toLocaleString();
    return `${who} · ${via} · ${when}`;
  }
}
