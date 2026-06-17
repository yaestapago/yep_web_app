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
import { LucideFileText, LucideLoaderCircle, LucideTriangleAlert } from '@lucide/angular';
import { finalize } from 'rxjs';

import { Modal } from '../../../../shared/ui/modal/modal';
import type {
  PaymentSupport,
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

interface Verifier {
  label: string;
  matched: boolean | null;
  detail: string;
}

/**
 * Modal de detalle de una transacción: resumen, cómo se validó, verificadores
 * (evidencias y coincidencias) y auditoría. Carga los soportes al abrir.
 */
@Component({
  selector: 'app-transaction-detail-modal',
  imports: [
    CurrencyPipe,
    DatePipe,
    Modal,
    LucideFileText,
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

  readonly open = computed(() => this.transaction() !== null);

  readonly supports = signal<PaymentSupport[]>([]);
  readonly loadingSupports = signal(false);
  readonly supportsError = signal('');

  private loadedId: string | null = null;

  constructor() {
    effect(() => {
      const transaction = this.transaction();
      if (!transaction) {
        this.loadedId = null;
        this.supports.set([]);
        this.supportsError.set('');
        return;
      }
      if (transaction.id === this.loadedId) {
        return;
      }
      this.loadedId = transaction.id;
      this.loadSupports(transaction.id);
    });
  }

  readonly method = computed(() => {
    const transaction = this.transaction();
    return transaction ? validationMethod(transaction.status, transaction.verification.level) : 'pendiente';
  });

  readonly methodLabel = computed(() => validationMethodLabel(this.method()));

  readonly verifiers = computed<Verifier[]>(() => {
    const transaction = this.transaction();
    if (!transaction) {
      return [];
    }

    const support = this.supports().find((item) => item.extracted) ?? null;
    const extracted = support?.extracted;

    const amountMatch =
      extracted?.amount != null ? Math.abs(extracted.amount - transaction.amount) < 0.01 : null;
    const referenceMatch =
      extracted?.reference && transaction.reference
        ? extracted.reference.trim().toLowerCase() === transaction.reference.trim().toLowerCase()
        : extracted?.reference != null
          ? false
          : null;
    const dateMatch = this.dateMatch(extracted?.transactionDate, transaction.transactionDate);

    return [
      {
        label: 'Evento bancario relacionado',
        matched: transaction.createdBySourceEventId ? true : null,
        detail: transaction.createdBySourceEventId
          ? 'Originada por un evento de fuente.'
          : 'Sin evento de origen registrado.',
      },
      {
        label: 'Coincidencia de monto',
        matched: amountMatch,
        detail:
          amountMatch == null
            ? 'Sin evidencia para comparar.'
            : amountMatch
              ? 'El monto coincide con la evidencia.'
              : 'El monto no coincide con la evidencia.',
      },
      {
        label: 'Coincidencia de referencia',
        matched: referenceMatch,
        detail:
          referenceMatch == null
            ? 'Sin referencia para comparar.'
            : referenceMatch
              ? 'La referencia coincide.'
              : 'La referencia no coincide completamente.',
      },
      {
        label: 'Coincidencia de fecha',
        matched: dateMatch,
        detail:
          dateMatch == null
            ? 'Sin fecha en la evidencia.'
            : dateMatch
              ? 'La fecha coincide.'
              : 'La fecha no coincide.',
      },
      {
        label: 'Evidencia de notificación',
        matched: this.supports().length > 0 ? true : null,
        detail:
          this.supports().length > 0
            ? `${this.supports().length} soporte(s) adjunto(s).`
            : 'Sin soportes adjuntos.',
      },
    ];
  });

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

  private dateMatch(a?: string, b?: string): boolean | null {
    if (!a || !b) {
      return null;
    }
    const da = new Date(a);
    const db = new Date(b);
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) {
      return null;
    }
    return da.toDateString() === db.toDateString();
  }
}
