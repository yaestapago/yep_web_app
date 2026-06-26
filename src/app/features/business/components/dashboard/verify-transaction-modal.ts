import { CurrencyPipe } from '@angular/common';
import { Component, computed, input as defineInput, output } from '@angular/core';
import { LucideShieldCheck } from '@lucide/angular';

import { Button } from '../../../../shared/ui/button/button';
import { Modal } from '../../../../shared/ui/modal/modal';
import type { PaymentTransaction } from '../../../../shared/models/transaction.models';
import { transactionStatusLabel } from '../../../../shared/utils/transaction-status';

/**
 * Modal de confirmación para verificar manualmente una transacción. No ejecuta
 * la verificación: confirma y delega al orquestador, que llama a la API.
 */
@Component({
  selector: 'app-verify-transaction-modal',
  imports: [CurrencyPipe, Button, Modal, LucideShieldCheck],
  templateUrl: './verify-transaction-modal.html',
  styleUrl: './verify-transaction-modal.scss',
})
export class VerifyTransactionModal {
  readonly transaction = defineInput<PaymentTransaction | null>(null);
  readonly loading = defineInput(false);

  readonly cancel = output<void>();
  readonly confirm = output<PaymentTransaction>();

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
}
