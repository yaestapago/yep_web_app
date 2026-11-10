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
import { LucideCheck, LucideShieldCheck, LucideTriangleAlert } from '@lucide/angular';
import { finalize } from 'rxjs';

import { canDecidePayment } from '../../../../core/constants/business-section-access';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import {
  Alert,
  Button,
  CardSection,
  DescriptionItem,
  DescriptionList,
  Modal,
  StatusChip,
} from '../../../../shared/ui';
import { Checkbox } from '../../../../shared/ui/checkbox/checkbox';
import type {
  CompleteDataRequest,
  MissingField,
  PaymentTransaction,
} from '../../../../shared/models/transaction.models';
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
  amount: 'Ej. $ 48.000',
  receiverAccount: 'Número completo de la cuenta',
  reference: 'Ej. M12345678',
  transactionDate: 'Ej. 05/07/2026 3:45 pm',
};

/** Qué formato acepta cada dato. Son las reglas de `parseMissingFieldValue` en el backend. */
const MISSING_FIELD_HINTS: Record<MissingField, string> = {
  amount: 'Escríbelo así: $ 48.000',
  receiverAccount: 'Escribe el número completo de la cuenta, al menos 4 dígitos.',
  reference: 'Al menos 4 caracteres, con un número.',
  transactionDate: 'Escríbela así: 05/07/2026 3:45 pm. La hora es obligatoria.',
};

/** Con solo los últimos dígitos, el backend guarda esos dígitos y no el número completo. */
const SHORT_ACCOUNT_MAX_DIGITS = 4;

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
    Alert,
    Button,
    CardSection,
    Checkbox,
    DescriptionItem,
    DescriptionList,
    Modal,
    StatusChip,
    TransactionSupportsPanel,
    LucideCheck,
    LucideShieldCheck,
    LucideTriangleAlert,
  ],
  templateUrl: './transaction-detail-modal.html',
  styleUrl: './transaction-detail-modal.scss',
})
export class TransactionDetailModal {
  private readonly api = inject(TransactionsApiService);
  private readonly session = inject(AuthSessionService);
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

  /** Solo el dueño o un super-usuario confirma o rechaza; al empleado el backend le da 403. */
  readonly canVerify = computed(() => {
    const transaction = this.transaction();
    return (
      transaction !== null &&
      canDecidePayment(this.session.activeMembership()?.role, this.session.isSuperUser()) &&
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
  /** Datos que el backend no entendió: se quedan como se escribieron, con su aviso. */
  readonly rejectedFields = signal<MissingField[]>([]);
  /**
   * La referencia no viene en el comprobante (p. ej. algunos de Nequi): se da
   * por resuelta sin inventar un número. El backend deja `reference` vacía.
   */
  readonly referenceNotShown = signal(false);

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
      this.rejectedFields.set([]);
      this.referenceNotShown.set(false);
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

  fieldHint(field: MissingField): string {
    return MISSING_FIELD_HINTS[field];
  }

  isRejected(field: MissingField): boolean {
    return this.rejectedFields().includes(field);
  }

  /** Avisa que quedarían guardados solo esos dígitos. No bloquea: quizá es lo único que se ve. */
  showsShortAccountWarning(field: MissingField): boolean {
    if (field !== 'receiverAccount') return false;
    const digits = this.formValue(field).replace(/\D/g, '');
    return digits.length > 0 && digits.length <= SHORT_ACCOUNT_MAX_DIGITS;
  }

  // --- Completar datos faltantes -------------------------------------------

  formValue(field: MissingField): string {
    return this.formValues()[field] ?? '';
  }

  setFormValue(field: MissingField, value: string): void {
    this.formValues.set({ ...this.formValues(), [field]: value });
    this.rejectedFields.update((fields) => fields.filter((item) => item !== field));
  }

  setReferenceNotShown(notShown: boolean): void {
    this.referenceNotShown.set(notShown);
    if (notShown) {
      // No se envían a la vez un número y "no aparece".
      const values = { ...this.formValues() };
      delete values.reference;
      this.formValues.set(values);
      this.rejectedFields.update((fields) => fields.filter((item) => item !== 'reference'));
    }
  }

  /** "No aparece" solo cuenta si la referencia es uno de los datos que faltan. */
  private sendsReferenceNotShown(): boolean {
    return this.referenceNotShown() && this.missingFields().includes('reference');
  }

  readonly canSubmit = computed(
    () =>
      this.sendsReferenceNotShown() ||
      this.missingFields().some((field) => (this.formValues()[field] ?? '').trim()),
  );

  submitCompleteData(): void {
    const transaction = this.transaction();
    if (!transaction || this.submitting() || !this.canSubmit()) {
      return;
    }
    const values = this.formValues();
    const payload: CompleteDataRequest = {};
    for (const field of this.missingFields()) {
      const value = (values[field] ?? '').trim();
      if (value) {
        payload[field] = value;
      }
    }
    if (this.sendsReferenceNotShown()) {
      delete payload.reference;
      payload.referenceNotShown = true;
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
          // Lo rechazado se queda como se escribió, para corregirlo sin volver a digitarlo.
          this.rejectedFields.set(response.rejected);
          if (response.rejected.length > 0) {
            this.completeError.set(
              `No entendimos: ${response.rejected
                .map((field) => this.fieldLabel(field))
                .join(', ')}. Revisa el formato.`,
            );
          }
          const kept: Partial<Record<MissingField, string>> = {};
          for (const field of response.rejected) {
            kept[field] = values[field];
          }
          this.formValues.set(kept);
          this.updated.emit(response.transaction);
        },
        error: (error) => this.completeError.set(httpErrorMessage(error)),
      });
  }
}
