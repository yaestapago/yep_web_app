import { CurrencyPipe, DOCUMENT, PercentPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideCamera,
  LucideCameraOff,
  LucideLoaderCircle,
  LucidePaperclip,
  LucideRotateCcw,
  LucideSend,
  LucideTriangleAlert,
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

type CaptureStep = 'capture' | 'review';

@Component({
  selector: 'app-receipt-capture-modal',
  imports: [
    CurrencyPipe,
    PercentPipe,
    ReactiveFormsModule,
    Modal,
    LucideCamera,
    LucideCameraOff,
    LucideLoaderCircle,
    LucidePaperclip,
    LucideRotateCcw,
    LucideSend,
    LucideTriangleAlert,
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
  private readonly document = inject(DOCUMENT);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly open = input(false);
  readonly closeRequested = output<void>();

  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');
  private stream: MediaStream | null = null;

  readonly businessName = computed(
    () => this.session.activeMembership()?.businessAccount?.name?.trim() || 'Negocio sin nombre',
  );
  readonly step = signal<CaptureStep>('capture');
  readonly cameraReady = signal(false);
  readonly cameraError = signal('');
  readonly extracting = signal(false);
  readonly creatingTransaction = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly selectedReceipt = signal<File | null>(null);
  readonly previewUrl = signal('');
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

  constructor() {
    // Enciende la cámara solo mientras el modal está abierto en el paso de
    // captura y todavía no hay una foto tomada; en cualquier otro caso libera
    // el dispositivo (la captura congela la imagen mostrando la foto tomada).
    effect(() => {
      const video = this.videoRef()?.nativeElement ?? null;
      if (this.open() && this.step() === 'capture' && !this.selectedReceipt() && video) {
        void this.startCamera(video);
      } else {
        this.stopCamera();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.stopCamera();
      this.revokePreview();
    });
  }

  close(): void {
    if (this.loading()) {
      return;
    }
    this.reset();
    this.closeRequested.emit();
  }

  capturePhoto(): void {
    const video = this.videoRef()?.nativeElement;
    if (!video || !this.cameraReady() || this.loading()) {
      return;
    }

    const canvas = this.document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context || !canvas.width || !canvas.height) {
      this.error.set('No se pudo capturar la imagen. Inténtalo de nuevo.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          this.error.set('No se pudo capturar la imagen. Inténtalo de nuevo.');
          return;
        }
        const file = new File([blob], `comprobante-${blob.size}.jpg`, { type: 'image/jpeg' });
        this.setReceiptPreview(file);
        this.runOcr(file);
      },
      'image/jpeg',
      0.92,
    );
  }

  onReceiptSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) {
      return;
    }
    this.setReceiptPreview(file);
    this.runOcr(file);
  }

  retake(): void {
    if (this.loading()) {
      return;
    }
    this.revokePreview();
    this.selectedReceipt.set(null);
    this.extraction.set(null);
    this.error.set('');
    this.success.set('');
    this.step.set('capture');
  }

  retryOcr(): void {
    const file = this.selectedReceipt();
    if (file && !this.loading()) {
      this.runOcr(file);
    }
  }

  createTransaction(): void {
    const extraction = this.extraction();
    if (!extraction) {
      this.error.set('Primero captura o adjunta un comprobante.');
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

  private async startCamera(video: HTMLVideoElement): Promise<void> {
    if (this.stream) {
      return;
    }
    this.cameraError.set('');

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      this.cameraError.set('Este dispositivo no permite usar la cámara. Adjunta una imagen.');
      return;
    }

    try {
      const stream = await mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      // El usuario pudo cerrar el modal, capturar o avanzar mientras se
      // resolvía el permiso.
      if (!this.open() || this.step() !== 'capture' || this.selectedReceipt()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.stream = stream;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      this.cameraReady.set(true);
    } catch {
      this.cameraError.set(
        'No pudimos activar la cámara. Revisa los permisos del navegador o adjunta una imagen.',
      );
    }
  }

  private stopCamera(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.cameraReady.set(false);
    const video = this.videoRef()?.nativeElement;
    if (video) {
      video.srcObject = null;
    }
  }

  private runOcr(file: File): void {
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
          this.step.set('review');
          this.success.set('OCR completado. Revisa los datos antes de crear la transacción.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  private setReceiptPreview(file: File): void {
    this.revokePreview();
    this.selectedReceipt.set(file);
    this.previewUrl.set(URL.createObjectURL(file));
    this.extraction.set(null);
    this.error.set('');
    this.success.set('');
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
    this.step.set('capture');
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
    this.step.set('capture');
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
    this.revokePreview();
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.previewUrl.set('');
    }
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
