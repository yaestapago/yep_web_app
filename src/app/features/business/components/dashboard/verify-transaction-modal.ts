import { CurrencyPipe } from '@angular/common';
import { Component, computed, input as defineInput, output } from '@angular/core';
import { LucideShieldCheck, LucideShieldX } from '@lucide/angular';

import { Button } from '../../../../shared/ui/button/button';
import { Modal } from '../../../../shared/ui/modal/modal';
import type { PaymentTransaction } from '../../../../shared/models/transaction.models';
import { transactionStatusLabel } from '../../../../shared/utils/transaction-status';

/**
 * Modal de decisión manual sobre una transacción. No ejecuta la verificación:
 * emite la decisión (confirmar/rechazar) y delega en la sección, que llama a la
 * API de decisión manual.
 */
@Component({
  selector: 'app-verify-transaction-modal',
  imports: [CurrencyPipe, Button, Modal, LucideShieldCheck, LucideShieldX],
  templateUrl: './verify-transaction-modal.html',
  styleUrl: './verify-transaction-modal.scss',
})
export class VerifyTransactionModal {
  readonly transaction = defineInput<PaymentTransaction | null>(null);
  readonly loading = defineInput(false);

  readonly cancel = output<void>();
  readonly confirm = output<PaymentTransaction>();
  readonly reject = output<PaymentTransaction>();

  readonly open = computed(() => this.transaction() !== null);

  statusLabel(transaction: PaymentTransaction): string {
    return transactionStatusLabel(transaction.status);
  }

  onConfirm(): void {
    const transaction = this.transaction();
    if (transaction) {
      this.confirm.emit(transaction);
    }
  }

  onReject(): void {
    const transaction = this.transaction();
    if (transaction) {
      this.reject.emit(transaction);
    }
  }
}
