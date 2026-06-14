import { CurrencyPipe, PercentPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideFileScan,
  LucideLoaderCircle,
  LucideSend,
  LucideTriangleAlert,
  LucideUpload,
} from '@lucide/angular';
import { finalize, switchMap } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import {
  TransactionExtractionResponse,
  nullablePartyToRequestParty,
} from '../../../../shared/models/extraction.models';
import {
  CreateTransactionRequest,
  MechanismKind,
  TransactionParty,
} from '../../../../shared/models/transaction.models';
import { Modal } from '../../../../shared/ui/modal/modal';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { SourceEventsApiService } from '../../../source-events/services/source-events-api.service';
import { TransactionEventsService } from '../../../transactions/services/transaction-events.service';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';
import { ExtractionApiService } from '../../services/extraction-api.service';

@Component({
  selector: 'app-receipt-capture-modal',
  imports: [
    CurrencyPipe,
    PercentPipe,
    ReactiveFormsModule,
    Modal,
    LucideFileScan,
    LucideLoaderCircle,
    LucideSend,
    LucideTriangleAlert,
    LucideUpload,
  ],
  templateUrl: './receipt-capture-modal.html',
  styleUrl: './receipt-capture-modal.scss',
})
export class ReceiptCaptureModal {
  private readonly extractionApi = inject(ExtractionApiService);
  private readonly sourceEventsApi = inject(SourceEventsApiService);
  private readonly transactionsApi = inject(TransactionsApiService);
  private readonly transactionEvents = inject(TransactionEventsService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly open = input(false);
  readonly closeRequested = output<void>();

  readonly businessName = computed(
    () => this.session.activeMembership()?.businessAccount?.name?.trim() || 'Negocio sin nombre',
  );
  readonly extracting = signal(false);
  readonly creatingTransaction = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly selectedReceipt = signal<File | null>(null);
  readonly extraction = signal<TransactionExtractionResponse | null>(null);
  readonly loading = computed(() => this.extracting() || this.creatingTransaction());

  readonly manualForm = this.fb.group({
    bankId: ['', [Validators.required, Validators.minLength(2)]],
    transactionDate: [this.defaultDateTimeLocal(), [Validators.required]],
    amount: [0, [Validators.required, Validators.min(1)]],
    currency: ['COP', [Validators.required, Validators.minLength(3)]],
    reference: [''],
    senderName: [''],
    senderAccount: [''],
    receiverName: [''],
    receiverAccount: [''],
    notes: [''],
  });

  close(): void {
    if (this.loading()) {
      return;
    }
    this.reset();
    this.closeRequested.emit();
  }

  onReceiptSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.selectedReceipt.set(file);
    this.extraction.set(null);
    this.success.set('');
    this.error.set('');
  }

  extractReceipt(): void {
    const file = this.selectedReceipt();
    if (!file) {
      this.error.set('Selecciona una imagen de comprobante.');
      return;
    }

    this.extracting.set(true);
    this.error.set('');
    this.success.set('');

    this.extractionApi
      .extractReceipt(file)
      .pipe(
        finalize(() => this.extracting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.extraction.set(response);
          this.patchFormFromExtraction(response);
          this.success.set('OCR completado. Revisa los datos antes de crear la transacción.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  createManualTransaction(): void {
    const request = this.buildTransactionRequest('manual');
    if (!request) {
      return;
    }

    this.creatingTransaction.set(true);
    this.error.set('');
    this.success.set('');

    this.transactionsApi
      .create(request)
      .pipe(
        finalize(() => this.creatingTransaction.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.afterTransactionCreated(response.action),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  createTransactionFromOcr(): void {
    const extraction = this.extraction();
    if (!extraction) {
      this.error.set('Primero ejecuta OCR sobre un comprobante.');
      return;
    }

    const request = this.buildTransactionRequest('ocr_extraction');
    if (!request) {
      return;
    }

    this.creatingTransaction.set(true);
    this.error.set('');
    this.success.set('');

    this.sourceEventsApi
      .ingest({
        sourceType: 'OCR_UPLOAD',
        rawPayload: {
          fileName: this.selectedReceipt()?.name,
          model: extraction.model,
          transaction: extraction.transaction,
          diagnostics: extraction.diagnostics,
        },
        normalized: {
          bankId: request.bankId,
          amount: request.amount,
          currency: request.currency,
          reference: request.reference,
          transactionDate: request.transactionDate,
          senderAccount: request.sender?.account,
          receiverAccount: request.receiver?.account,
        },
      })
      .pipe(
        switchMap((event) => this.transactionsApi.create({ ...request, sourceEventId: event.id })),
        finalize(() => this.creatingTransaction.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.afterTransactionCreated(response.action),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  isInvalid(controlName: keyof typeof this.manualForm.controls): boolean {
    const control = this.manualForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  isDirty(): boolean {
    return this.manualForm.dirty || this.selectedReceipt() !== null || this.extraction() !== null;
  }

  private buildTransactionRequest(mechanismKind: MechanismKind): CreateTransactionRequest | null {
    this.error.set('');

    if (this.manualForm.invalid) {
      this.manualForm.markAllAsTouched();
      return null;
    }

    const raw = this.manualForm.getRawValue();
    const amount = Number(raw.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.error.set('Ingresa un valor válido para la transacción.');
      return null;
    }

    return {
      bankId: raw.bankId.trim().toLowerCase(),
      transactionDate: this.toIsoDate(raw.transactionDate),
      amount,
      currency: raw.currency.trim().toUpperCase() || 'COP',
      reference: this.optional(raw.reference),
      sender: this.party(raw.senderName, raw.senderAccount),
      receiver: this.party(raw.receiverName, raw.receiverAccount),
      mechanismKind,
      notes: this.optional(raw.notes),
    };
  }

  private afterTransactionCreated(
    action: 'CREATED' | 'RETURNED_EXISTING' | 'DUPLICATE_DETECTED',
  ): void {
    this.success.set(
      action === 'CREATED'
        ? 'Transacción creada.'
        : 'Ya existía una transacción con los mismos datos.',
    );
    this.resetForm();
    this.transactionEvents.notifyChanged();
  }

  private patchFormFromExtraction(response: TransactionExtractionResponse): void {
    const transaction = response.transaction;
    const sender = nullablePartyToRequestParty(transaction.sender);
    const receiver = nullablePartyToRequestParty(transaction.receiver);

    this.manualForm.patchValue({
      bankId: transaction.bank?.trim().toLowerCase() ?? '',
      transactionDate: this.toDateTimeLocal(transaction.dateTime ?? new Date().toISOString()),
      amount: transaction.amount ?? 0,
      currency: transaction.currency ?? 'COP',
      reference: transaction.reference ?? '',
      senderName: sender?.name ?? '',
      senderAccount: sender?.account ?? '',
      receiverName: receiver?.name ?? '',
      receiverAccount: receiver?.account ?? '',
    });
  }

  private reset(): void {
    this.resetForm();
    this.error.set('');
    this.success.set('');
  }

  private resetForm(): void {
    this.manualForm.reset({
      bankId: '',
      transactionDate: this.defaultDateTimeLocal(),
      amount: 0,
      currency: 'COP',
      reference: '',
      senderName: '',
      senderAccount: '',
      receiverName: '',
      receiverAccount: '',
      notes: '',
    });
    this.extraction.set(null);
    this.selectedReceipt.set(null);
  }

  private party(name: string, account: string): TransactionParty | undefined {
    const normalized = {
      name: this.optional(name),
      account: this.optional(account),
    };
    return normalized.name || normalized.account ? normalized : undefined;
  }

  private optional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private defaultDateTimeLocal(): string {
    return this.toDateTimeLocal(new Date().toISOString());
  }

  private toDateTimeLocal(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return this.toDateTimeLocal(new Date().toISOString());
    }

    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
  }

  private toIsoDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }
}
