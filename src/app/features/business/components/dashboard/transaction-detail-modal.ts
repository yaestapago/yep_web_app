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
import { LucideCheck, LucideLoaderCircle, LucideTriangleAlert } from '@lucide/angular';
import { finalize } from 'rxjs';

import { Button } from '../../../../shared/ui/button/button';
import { Modal } from '../../../../shared/ui/modal/modal';
import type { MissingField, PaymentTransaction } from '../../../../shared/models/transaction.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import {
  isTransactionInvoiceable,
  isTransactionVerifiable,
  transactionStatusLabel,
  transactionTone,
} from '../../../../shared/utils/transaction-status';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';
import { TransactionSupportsPanel } from './transaction-supports-panel';

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
 * validó y soportes relacionados (delegado a `TransactionSupportsPanel`,
 * compartido con `SourceEventDetailModal`), más auditoría y completar datos
 * faltantes (NEEDS_INPUT). Se usa desde el drill-down de KPIs y desde el
 * detalle de un evento ya enlazado a una transacción.
 */
@Component({
  selector: 'app-transaction-detail-modal',
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    Button,
    Modal,
    TransactionSupportsPanel,
    LucideCheck,
    LucideLoaderCircle,
    LucideTriangleAlert,
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
  /** Pide a la sección padre abrir el modal de verificación manual. */
  readonly verifyRequested = output<PaymentTransaction>();
  /** Pide a la sección padre abrir el modal de "aplicar a factura". */
  readonly invoiceRequested = output<PaymentTransaction>();

  readonly open = computed(() => this.transaction() !== null);

  readonly canVerify = computed(() => {
    const transaction = this.transaction();
    return (
      transaction !== null &&
      isTransactionVerifiable(transaction.status, transaction.verification.canBeConsideredPaid)
    );
  });

  readonly canApplyInvoice = computed(() => {
    const transaction = this.transaction();
    return transaction !== null && isTransactionInvoiceable(transaction.status);
  });

  readonly needsInput = computed(() => this.transaction()?.status === 'NEEDS_INPUT');

  readonly missingFields = computed<MissingField[]>(
    () => this.transaction()?.dataRequest?.missingFields ?? [],
  );

  // Formulario para completar datos faltantes (NEEDS_INPUT).
  readonly formValues = signal<Partial<Record<MissingField, string>>>({});
  readonly submitting = signal(false);
  readonly completeError = signal('');

  private loadedId: string | null = null;

  constructor() {
    // Limpia el formulario de "completar datos" cuando cambia la transacción
    // mostrada (la carga de soportes/recibo vive en TransactionSupportsPanel).
    effect(() => {
      const transaction = this.transaction();
      const id = transaction?.id ?? null;
      if (id === this.loadedId) {
        return;
      }
      this.loadedId = id;
      this.formValues.set({});
      this.completeError.set('');
    });
  }

  statusLabel(transaction: PaymentTransaction): string {
    return transactionStatusLabel(transaction.status);
  }

  tone(transaction: PaymentTransaction): string {
    return transactionTone(transaction.status);
  }

  sender(transaction: PaymentTransaction): string {
    return (
      transaction.sender?.name?.trim() ||
      transaction.sender?.account?.trim() ||
      'No registrado'
    );
  }

  fieldLabel(field: MissingField): string {
    return MISSING_FIELD_LABELS[field];
  }

  fieldPlaceholder(field: MissingField): string {
    return MISSING_FIELD_PLACEHOLDERS[field];
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
          this.updated.emit(response.transaction);
        },
        error: (error) => this.completeError.set(httpErrorMessage(error)),
      });
  }
}
