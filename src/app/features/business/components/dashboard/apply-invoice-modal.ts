import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, input as defineInput, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import type { PaymentTransaction } from '../../../../shared/models/transaction.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';

/**
 * Modal para asociar (o corregir) el número de factura/contrato de una
 * transacción ya verificada. Reusa `manual-decision` con `decision:
 * 'confirmed'` (idempotente sobre transacciones ya confirmadas) porque es
 * el único endpoint que persiste `invoiceReference` hoy.
 *
 * Cuando `required()` es true (encadenado desde "Confirmar pago" en una
 * cuenta que exige el campo), este modal es además quien efectivamente
 * confirma el pago: evita mandar la confirmación sin el dato y recibir un
 * 400 del backend.
 */
@Component({
  selector: 'app-apply-invoice-modal',
  imports: [CurrencyPipe, ReactiveFormsModule, Button, Input, Modal],
  templateUrl: './apply-invoice-modal.html',
  styleUrls: ['./verify-transaction-modal.scss', './apply-invoice-modal.scss'],
})
export class ApplyInvoiceModal {
  private readonly api = inject(TransactionsApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly destroyRef = inject(DestroyRef);

  readonly transaction = defineInput<PaymentTransaction | null>(null);
  /** Label configurado por el owner para el campo (ej. "Factura Numero"). */
  readonly label = defineInput('Factura Numero');
  /** True cuando este modal además debe confirmar el pago pendiente. */
  readonly required = defineInput(false);

  readonly closeRequested = output<void>();
  readonly saved = output<PaymentTransaction>();

  readonly open = computed(() => this.transaction() !== null);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly form = this.fb.group({
    invoiceReference: [''],
  });

  constructor() {
    // Prellena con el valor actual (si ya tenía factura asociada) y aplica
    // el validador required solo cuando el modal viene en modo obligatorio.
    effect(() => {
      const tx = this.transaction();
      if (!tx) return;
      this.error.set('');
      this.form.reset({ invoiceReference: tx.invoiceReference ?? '' });
      this.form.controls.invoiceReference.setValidators(
        this.required() ? [Validators.required] : [],
      );
      this.form.controls.invoiceReference.updateValueAndValidity();
    });
  }

  isInvalid(): boolean {
    const control = this.form.controls.invoiceReference;
    return control.invalid && (control.dirty || control.touched);
  }

  fieldError(): string {
    if (!this.isInvalid()) return '';
    return `${this.label()} es obligatorio para confirmar el pago`;
  }

  save(): void {
    const transaction = this.transaction();
    if (!transaction) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const invoiceReference = this.form.getRawValue().invoiceReference.trim() || undefined;
    this.saving.set(true);
    this.error.set('');

    this.api
      .manualDecision(transaction.id, { decision: 'confirmed', invoiceReference })
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.saved.emit(response.transaction),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  close(): void {
    if (this.saving()) return;
    this.closeRequested.emit();
  }
}
