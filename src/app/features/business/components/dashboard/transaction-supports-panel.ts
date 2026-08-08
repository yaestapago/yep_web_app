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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideBell,
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

import type {
  DataRequestEntry,
  MissingField,
  PaymentSupport,
  PaymentSupportType,
  PaymentTransaction,
} from '../../../../shared/models/transaction.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import {
  isTransactionInvoiceable,
  isTransactionVerifiable,
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

/**
 * Contenido compartido de "¿cómo se validó y con qué?" para una transacción:
 * nivel de verificación, comprobante (con foto y aviso de duplicado) y demás
 * soportes/eventos enlazados. Lo embeben `TransactionDetailModal` (detalle
 * clásico, usado también desde el drill-down de KPIs) y
 * `SourceEventDetailModal` (detalle de un evento con transacción ya
 * enlazada) — un solo lugar para esta lógica evita mantenerla dos veces.
 */
@Component({
  selector: 'app-transaction-supports-panel',
  imports: [
    CurrencyPipe,
    DatePipe,
    LucideBell,
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
  templateUrl: './transaction-supports-panel.html',
  styleUrl: './transaction-detail-modal.scss',
})
export class TransactionSupportsPanel {
  private readonly api = inject(TransactionsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly transaction = defineInput.required<PaymentTransaction>();

  /** Pide al modal contenedor abrir el detalle de un evento (por su id). */
  readonly viewSourceEvent = output<string>();
  /** Pide al modal contenedor abrir el modal de verificación manual. */
  readonly verifyRequested = output<PaymentTransaction>();
  /** Pide al modal contenedor abrir el modal de "aplicar a factura". */
  readonly invoiceRequested = output<PaymentTransaction>();

  readonly supports = signal<PaymentSupport[]>([]);
  readonly loadingSupports = signal(false);
  readonly supportsError = signal('');

  // Foto del comprobante (lightbox).
  readonly receiptUrl = signal<string | null>(null);
  readonly loadingReceiptId = signal<string | null>(null);
  readonly receiptError = signal('');

  private loadedId: string | null = null;

  constructor() {
    effect(() => {
      const transaction = this.transaction();
      if (transaction.id === this.loadedId) {
        return;
      }
      this.loadedId = transaction.id;
      this.resetReceipt();
      this.loadSupports(transaction.id);
    });
  }

  readonly method = computed(() =>
    validationMethod(this.transaction().status, this.transaction().verification.level),
  );

  readonly methodLabel = computed(() => validationMethodLabel(this.method()));

  readonly levelLabel = computed(() => verificationLevelLabel(this.transaction().verification.level));

  readonly canVerify = computed(() => {
    const transaction = this.transaction();
    return isTransactionVerifiable(transaction.status, transaction.verification.canBeConsideredPaid);
  });

  readonly canApplyInvoice = computed(() => isTransactionInvoiceable(this.transaction().status));

  /** Eventos bancarios enlazados, con etiqueta amigable y clickeables. */
  readonly relatedEvents = computed(() =>
    (this.transaction().events ?? []).map((event) => ({
      eventId: event.eventId,
      sourceType: event.sourceType,
      label: EVENT_SOURCE_LABELS[event.sourceType] ?? event.source,
      linkedAt: event.linkedAt,
    })),
  );

  /** Confirmaciones manuales y datos completados por el staff (sintéticos). */
  readonly manualEntries = computed<ManualEntry[]>(() => {
    const transaction = this.transaction();
    const entries: ManualEntry[] = [];
    const review = transaction.manualReview;
    if (review) {
      const who = review.byUserName || 'Usuario';
      const when = new Date(review.at).toLocaleString();
      entries.push({
        label: review.decision === 'confirmed' ? 'Confirmación manual' : 'Rechazo manual',
        detail: `${who} · ${when}${review.note ? ` · ${review.note}` : ''}`,
      });
    }
    for (const item of transaction.dataRequest?.history ?? []) {
      entries.push({
        label: `Dato completado: ${this.fieldLabel(item.field)}`,
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

  /** ¿Alguno de los comprobantes (OCR_RECEIPT) quedó marcado duplicado? */
  readonly hasDuplicateReceipt = computed(() =>
    this.supports().some(
      (support) => support.type === 'OCR_RECEIPT' && support.linkStatus === 'DUPLICATE',
    ),
  );

  supportLabel(type: PaymentSupportType): string {
    return SUPPORT_TYPE_LABELS[type] ?? type;
  }

  /** Un soporte con imagen adjunta puede abrirse como foto. */
  hasPhoto(support: PaymentSupport): boolean {
    return support.type === 'OCR_RECEIPT' || Boolean(support.file);
  }

  isDuplicateSupport(support: PaymentSupport): boolean {
    return support.linkStatus === 'DUPLICATE';
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

  private fieldLabel(field: MissingField): string {
    const labels: Record<MissingField, string> = {
      amount: 'Monto',
      receiverAccount: 'Cuenta de destino',
      reference: 'Número de comprobante',
      transactionDate: 'Fecha y hora',
    };
    return labels[field];
  }

  private dataEntryDetail(item: DataRequestEntry): string {
    const who = item.byName || 'Staff';
    const via = item.via === 'whatsapp' ? 'WhatsApp' : 'módulo';
    const when = new Date(item.at).toLocaleString();
    return `${who} · ${via} · ${when}`;
  }
}
