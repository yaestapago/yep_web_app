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
  LucideRotateCcw,
  LucideSend,
} from '@lucide/angular';
import { Observable, catchError, finalize, map, of, switchMap, throwError } from 'rxjs';

import { canAccessSubscription } from '../../../../core/constants/business-section-access';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import {
  TransactionExtractionResponse,
  nullablePartyToRequestParty,
} from '../../../../shared/models/extraction.models';
import {
  AttachSupportRequest,
  CreateTransactionRequest,
  MechanismKind,
  PaymentTransaction,
  TransactionParty,
  VerificationLevel,
} from '../../../../shared/models/transaction.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { DescriptionItem } from '../../../../shared/ui/description-list/description-item';
import { DescriptionList } from '../../../../shared/ui/description-list/description-list';
import { FileDrop, FileDropItem } from '../../../../shared/ui/file-drop/file-drop';
import { Modal } from '../../../../shared/ui/modal/modal';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BanksApiService } from '../../../banks/services/banks-api.service';
import { TransactionEventsService } from '../../../transactions/services/transaction-events.service';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';
import { ExtractionApiService } from '../../services/extraction-api.service';
import {
  RECEIPT_OCR_ACCEPT,
  RECEIPT_PHOTO_NOT_SAVED_MESSAGE,
  isInvalidFileKeyError,
  receiptFileProblem,
  receiptOcrErrorMessage,
} from '../../utils/receipt-capture-errors';

type CaptureStep = 'capture' | 'review';

@Component({
  selector: 'app-receipt-capture-modal',
  imports: [
    CurrencyPipe,
    PercentPipe,
    ReactiveFormsModule,
    Modal,
    Alert,
    Button,
    DescriptionList,
    DescriptionItem,
    FileDrop,
    LucideCamera,
    LucideCameraOff,
    LucideLoaderCircle,
    LucideRotateCcw,
    LucideSend,
  ],
  templateUrl: './receipt-capture-modal.html',
  styleUrl: './receipt-capture-modal.scss',
})
export class ReceiptCaptureModal {
  private readonly extractionApi = inject(ExtractionApiService);
  private readonly transactionsApi = inject(TransactionsApiService);
  private readonly transactionEvents = inject(TransactionEventsService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notificationModal = inject(NotificationModalService);
  private readonly banksApi = inject(BanksApiService);

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
  /** Algo salió a medias: el pago quedó, pero no todo (p. ej. la foto). */
  readonly warning = signal('');
  readonly accept = RECEIPT_OCR_ACCEPT;
  readonly selectedReceipt = signal<File | null>(null);
  readonly previewUrl = signal('');
  readonly extraction = signal<TransactionExtractionResponse | null>(null);
  /** Código → nombre del catálogo de bancos: `bank` llega como código (`nequi`). */
  private readonly bankNames = signal<ReadonlyMap<string, string>>(new Map());
  private bankNamesRequested = false;
  /** Nombre del banco leído. Lo que no está en el catálogo se muestra como llegó. */
  readonly bankName = computed(() => {
    const bank = this.extraction()?.transaction.bank?.trim();
    if (!bank) return 'Sin datos';
    return this.bankNames().get(bank.toLowerCase()) ?? bank;
  });
  /**
   * Con reglas, `confidence` es la parte de los datos que se leyó, no qué tan cierto es:
   * un 100 % dice que se leyó todo, no que el comprobante sea real.
   */
  readonly confidenceLabel = computed(() =>
    this.extraction()?.model === 'rules' ? 'Datos leídos' : 'Confianza',
  );
  readonly loading = computed(() => this.extracting() || this.creatingTransaction());
  /** Presentación: el comprobante elegido como fila de `yep-file-drop`. */
  readonly receiptFiles = computed<FileDropItem[]>(() => {
    const file = this.selectedReceipt();
    return file ? [{ name: file.name, size: file.size, previewUrl: this.previewUrl() || undefined }] : [];
  });

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
    effect(() => {
      if (this.open() && !this.bankNamesRequested) {
        this.bankNamesRequested = true;
        this.loadBankNames();
      }
    });

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

  async close(): Promise<void> {
    if (this.loading()) {
      return;
    }

    if (this.isDirty()) {
      const confirmed = await this.notificationModal.confirm({
        title: 'Descartar captura',
        message: 'Tienes cambios sin guardar en el comprobante.',
        type: 'warning',
        confirmText: 'Descartar',
      });

      if (!confirmed) {
        return;
      }
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
    this.warning.set('');
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
    this.warning.set('');

    // `fileHash` es la huella del archivo: la misma foto subida dos veces devuelve
    // la transacción que ya existe. Ya no se registra un evento `OCR_UPLOAD` antes:
    // el backend retiró ese tipo y lo rechaza con 400.
    const file = extraction.file;
    this.transactionsApi
      .create({ ...request, fileHash: file?.hash })
      .pipe(
        // Tras crear: adjuntar el comprobante como soporte OCR, con su foto, y
        // disparar la verificación, que además enlaza eventos de banco
        // coincidentes. Si la transacción ya existía no re-procesamos.
        switchMap((response) => {
          if (response.action !== 'CREATED') {
            return of({ action: response.action, transaction: response.transaction, photoSaved: true });
          }
          const transactionId = response.transaction.id;
          return this.attachReceipt(transactionId, this.buildSupportRequest(request, file)).pipe(
            switchMap((photoSaved) =>
              this.transactionsApi
                .runVerification(transactionId, 'support_aggregation')
                .pipe(map((verified) => ({ action: response.action, transaction: verified.transaction, photoSaved }))),
            ),
          );
        }),
        finalize(() => this.creatingTransaction.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ action, transaction, photoSaved }) => {
          this.afterTransactionCreated(action, transaction);
          if (!photoSaved) {
            this.warning.set(RECEIPT_PHOTO_NOT_SAVED_MESSAGE);
          }
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  /**
   * Adjunta el soporte; emite si la foto quedó guardada. Con una clave que no es de
   * este negocio (400) se adjunta sin la foto para no dejar el pago sin soporte ni
   * verificación.
   */
  private attachReceipt(transactionId: string, support: AttachSupportRequest): Observable<boolean> {
    return this.transactionsApi.attachSupport(transactionId, support).pipe(
      map(() => true),
      catchError((error: unknown) =>
        isInvalidFileKeyError(error) && support.file
          ? this.transactionsApi
              .attachSupport(transactionId, { ...support, file: undefined })
              .pipe(map(() => false))
          : throwError(() => error),
      ),
    );
  }

  private buildSupportRequest(
    request: CreateTransactionRequest,
    file: TransactionExtractionResponse['file'],
  ): AttachSupportRequest {
    return {
      type: 'OCR_RECEIPT',
      mechanismKind: 'ocr_extraction',
      file: file ? { key: file.key, hash: file.hash, mimeType: file.mimeType, sizeBytes: file.sizeBytes } : undefined,
      extracted: {
        bankId: request.bankId,
        amount: request.amount,
        currency: request.currency,
        reference: request.reference,
        transactionDate: request.transactionDate,
        sender: request.sender,
        receiver: request.receiver,
      },
    };
  }

  isInvalid(controlName: keyof typeof this.manualForm.controls): boolean {
    const control = this.manualForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  isDirty(): boolean {
    return this.manualForm.dirty || this.selectedReceipt() !== null || this.extraction() !== null;
  }

  private loadBankNames(): void {
    this.banksApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ banks }) =>
          this.bankNames.set(new Map(banks.map((bank) => [bank.code.toLowerCase(), bank.name]))),
        // Sin catálogo se muestra el código, como antes: no impide registrar el pago.
        error: () => (this.bankNamesRequested = false),
      });
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
    // Un archivo que el servidor rechazaría no se envía: el aviso sale de una vez.
    const problem = receiptFileProblem(file);
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.extracting.set(true);
    this.error.set('');
    this.success.set('');
    this.warning.set('');

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
        error: (error) => this.error.set(receiptOcrErrorMessage(error, this.canManagePlan())),
      });
  }

  /** Solo el dueño (o un super-usuario) entra a Suscripción a cambiar el plan. */
  private canManagePlan(): boolean {
    return canAccessSubscription(this.session.activeMembership()?.role, this.session.isSuperUser());
  }

  private setReceiptPreview(file: File): void {
    this.revokePreview();
    this.selectedReceipt.set(file);
    this.previewUrl.set(URL.createObjectURL(file));
    this.extraction.set(null);
    this.error.set('');
    this.success.set('');
    this.warning.set('');
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
    transaction?: PaymentTransaction,
  ): void {
    const base =
      action === 'CREATED'
        ? 'Transacción creada'
        : 'Ya existía una transacción con los mismos datos';
    const verdict = transaction ? this.verificationSummary(transaction.verification.level) : '';
    this.success.set(verdict ? `${base}. ${verdict}` : `${base}.`);
    this.resetForm();
    this.step.set('capture');
    this.transactionEvents.notifyChanged();
  }

  private verificationSummary(level: VerificationLevel): string {
    switch (level) {
      case 'HIGH':
      case 'MANUAL':
        return 'Pago confirmado por el banco ✓';
      case 'MEDIUM':
        return 'Coincide con eventos del banco; falta confirmación final.';
      case 'LOW':
        return 'Validando con el banco; aún sin eventos relacionados.';
      default:
        return '';
    }
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
    this.warning.set('');
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
