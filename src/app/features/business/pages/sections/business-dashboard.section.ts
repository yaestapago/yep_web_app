import { CurrencyPipe, DatePipe, PercentPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideActivity,
  LucideBanknote,
  LucideBell,
  LucideFileScan,
  LucideLoaderCircle,
  LucideRefreshCw,
  LucideSend,
  LucideShieldCheck,
  LucideTriangleAlert,
  LucideUpload,
} from '@lucide/angular';
import { finalize, interval, switchMap } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import {
  TransactionExtractionResponse,
  nullablePartyToRequestParty,
} from '../../../../shared/models/extraction.models';
import type { SourceEvent } from '../../../../shared/models/source-event.models';
import {
  CreateTransactionRequest,
  MechanismKind,
  PaymentTransaction,
  TransactionParty,
} from '../../../../shared/models/transaction.models';
import type { Notifier } from '../../../../shared/models/notifier.models';
import {
  NOTIFIER_STATUS_THRESHOLDS,
  computeNotifierStatus,
  relativeFromMs,
  type NotifierStatus,
  type NotifierStatusLevel,
} from '../../../../shared/utils/notifier-status';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { ExtractionApiService } from '../../../extraction/services/extraction-api.service';
import { NotifiersApiService } from '../../../notifiers/services/notifiers-api.service';
import { SourceEventsApiService } from '../../../source-events/services/source-events-api.service';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';

interface DayBar {
  label: string;
  total: number;
  /** Alto relativo (0-100) respecto al día con mayor total. */
  height: number;
}

/**
 * Panel de control del negocio (ruta canónica `/businesses/:businessId/dashboard`).
 * Consolida la operación diaria: estadísticas, gráficas con datos reales, estado
 * compacto de notificadores, transacciones y eventos recientes, y la captura por
 * OCR. La gestión de cuentas, sedes, notificadores y solicitudes vive en las
 * vistas del grupo "Negocio".
 */
@Component({
  selector: 'app-business-dashboard-section',
  imports: [
    CurrencyPipe,
    DatePipe,
    PercentPipe,
    ReactiveFormsModule,
    LucideActivity,
    LucideBanknote,
    LucideBell,
    LucideFileScan,
    LucideLoaderCircle,
    LucideRefreshCw,
    LucideSend,
    LucideShieldCheck,
    LucideTriangleAlert,
    LucideUpload,
  ],
  templateUrl: './business-dashboard.section.html',
  // Comparte estilos genéricos (kpi, empty-state, loading-row…) con las demás
  // secciones del negocio; los específicos del panel viven en su propio archivo.
  styleUrls: ['./business-sections.scss', './business-dashboard.section.scss'],
})
export class BusinessDashboardSection implements OnInit {
  private readonly transactionsApi = inject(TransactionsApiService);
  private readonly sourceEventsApi = inject(SourceEventsApiService);
  private readonly notifiersApi = inject(NotifiersApiService);
  private readonly extractionApi = inject(ExtractionApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly thresholds = inject(NOTIFIER_STATUS_THRESHOLDS);

  readonly account = computed(() => this.session.activeMembership()?.businessAccount ?? null);
  readonly businessName = computed(() => this.account()?.name?.trim() || 'Negocio sin nombre');

  // --- Datos ---
  readonly transactions = signal<PaymentTransaction[]>([]);
  readonly sourceEvents = signal<SourceEvent[]>([]);
  readonly notifiers = signal<Notifier[]>([]);

  readonly loadingTransactions = signal(false);
  readonly loadingEvents = signal(false);
  readonly loadingNotifiers = signal(false);
  readonly transactionsError = signal('');
  readonly eventsError = signal('');
  readonly notifiersError = signal('');

  readonly loadingAny = computed(
    () => this.loadingTransactions() || this.loadingEvents() || this.loadingNotifiers(),
  );

  /** Tick para recalcular el estado relativo de notificadores sin recargar. */
  private readonly now = signal(Date.now());

  // --- Captura / OCR ---
  readonly extracting = signal(false);
  readonly creatingTransaction = signal(false);
  readonly verifyingId = signal<string | null>(null);
  readonly captureError = signal('');
  readonly captureSuccess = signal('');
  readonly selectedReceipt = signal<File | null>(null);
  readonly extraction = signal<TransactionExtractionResponse | null>(null);

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

  // --- Estadísticas ---
  readonly totalAmount = computed(() =>
    this.transactions().reduce((total, transaction) => total + transaction.amount, 0),
  );
  readonly paidCount = computed(
    () => this.transactions().filter((t) => t.verification.canBeConsideredPaid).length,
  );
  readonly openReviewCount = computed(
    () =>
      this.transactions().filter((t) =>
        ['PENDING_VERIFICATION', 'NEEDS_REVIEW'].includes(t.status),
      ).length,
  );
  readonly eventsCount = computed(() => this.sourceEvents().length);
  readonly activeNotifierCount = computed(() => this.notifiers().filter((n) => n.active).length);

  // --- Estado de notificadores (semáforo compacto) ---
  readonly notifierStatuses = computed<Array<{ notifier: Notifier; status: NotifierStatus }>>(() => {
    const now = this.now();
    return this.notifiers().map((notifier) => ({
      notifier,
      status: computeNotifierStatus(notifier, this.thresholds, now),
    }));
  });

  readonly notifierCounts = computed(() => {
    const base: Record<NotifierStatusLevel, number> = {
      online: 0,
      delayed: 0,
      offline: 0,
      unknown: 0,
    };
    for (const { status } of this.notifierStatuses()) {
      base[status.level] += 1;
    }
    return base;
  });

  /** Disponibilidad: notificadores en línea sobre el total. */
  readonly availability = computed(() => {
    const total = this.notifiers().length;
    return total === 0 ? 0 : this.notifierCounts().online / total;
  });

  // --- Gráfica: capturado por día (últimos 7 días), con datos reales ---
  readonly dailyTotals = computed<DayBar[]>(() => {
    const now = this.now();
    const days: DayBar[] = [];
    const buckets = new Map<string, number>();

    for (const transaction of this.transactions()) {
      const date = new Date(transaction.transactionDate);
      if (Number.isNaN(date.getTime())) {
        continue;
      }
      const key = this.dayKey(date);
      buckets.set(key, (buckets.get(key) ?? 0) + transaction.amount);
    }

    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(now - offset * 24 * 60 * 60 * 1000);
      const key = this.dayKey(date);
      days.push({
        label: date.toLocaleDateString('es', { weekday: 'short' }),
        total: buckets.get(key) ?? 0,
        height: 0,
      });
    }

    const max = Math.max(...days.map((day) => day.total), 0);
    return days.map((day) => ({
      ...day,
      height: max === 0 ? 0 : Math.round((day.total / max) * 100),
    }));
  });

  readonly hasChartData = computed(() => this.dailyTotals().some((day) => day.total > 0));

  /** Transacciones recientes (las 6 más recientes). */
  readonly recentTransactions = computed(() => this.transactions().slice(0, 6));
  /** Eventos recientes (los 6 más recientes). */
  readonly recentEvents = computed(() => this.sourceEvents().slice(0, 6));

  ngOnInit(): void {
    this.refresh();

    // Refresco del tick para recalcular el semáforo de notificadores.
    interval(this.thresholds.refreshIntervalMs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));
  }

  refresh(): void {
    if (!this.session.activeBusinessAccountId()) {
      return;
    }
    this.loadTransactions();
    this.loadSourceEvents();
    this.loadNotifiers();
  }

  loadTransactions(): void {
    this.loadingTransactions.set(true);
    this.transactionsError.set('');

    this.transactionsApi
      .list({ limit: 100 })
      .pipe(
        finalize(() => this.loadingTransactions.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.transactions.set(response.transactions);
          this.now.set(Date.now());
        },
        error: (error) => this.transactionsError.set(httpErrorMessage(error)),
      });
  }

  loadSourceEvents(): void {
    this.loadingEvents.set(true);
    this.eventsError.set('');

    this.sourceEventsApi
      .list()
      .pipe(
        finalize(() => this.loadingEvents.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.sourceEvents.set(response.sourceEvents),
        error: (error) => this.eventsError.set(httpErrorMessage(error)),
      });
  }

  loadNotifiers(): void {
    this.loadingNotifiers.set(true);
    this.notifiersError.set('');

    this.notifiersApi
      .list()
      .pipe(
        finalize(() => this.loadingNotifiers.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.notifiers.set(response.notifiers);
          this.now.set(Date.now());
        },
        error: (error) => this.notifiersError.set(httpErrorMessage(error)),
      });
  }

  // --- Estado de notificadores: helpers de accesibilidad ---

  notifierName(notifier: Notifier): string {
    return notifier.displayName?.trim() || 'Notificador sin nombre';
  }

  notifierAriaLabel(name: string, status: NotifierStatus): string {
    return status.level === 'unknown'
      ? `${name}: sin datos`
      : `${name}: ${status.label}`;
  }

  // --- Captura / OCR ---

  onReceiptSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.selectedReceipt.set(file);
    this.extraction.set(null);
    this.captureSuccess.set('');
    this.captureError.set('');
  }

  extractReceipt(): void {
    const file = this.selectedReceipt();

    if (!file) {
      this.captureError.set('Selecciona una imagen de comprobante.');
      return;
    }

    this.extracting.set(true);
    this.captureError.set('');
    this.captureSuccess.set('');

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
          this.captureSuccess.set('OCR completado. Revisa los datos antes de crear la transacción.');
        },
        error: (error) => this.captureError.set(httpErrorMessage(error)),
      });
  }

  createManualTransaction(): void {
    const request = this.buildTransactionRequest('manual');
    if (!request) {
      return;
    }

    this.creatingTransaction.set(true);
    this.captureError.set('');
    this.captureSuccess.set('');

    this.transactionsApi
      .create(request)
      .pipe(
        finalize(() => this.creatingTransaction.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.afterTransactionCreated(response.transaction, response.action),
        error: (error) => this.captureError.set(httpErrorMessage(error)),
      });
  }

  createTransactionFromOcr(): void {
    const extraction = this.extraction();

    if (!extraction) {
      this.captureError.set('Primero ejecuta OCR sobre un comprobante.');
      return;
    }

    const request = this.buildTransactionRequest('ocr_extraction');
    if (!request) {
      return;
    }

    this.creatingTransaction.set(true);
    this.captureError.set('');
    this.captureSuccess.set('');

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
        next: (response) => this.afterTransactionCreated(response.transaction, response.action),
        error: (error) => this.captureError.set(httpErrorMessage(error)),
      });
  }

  runVerification(transaction: PaymentTransaction): void {
    this.verifyingId.set(transaction.id);
    this.captureError.set('');

    this.transactionsApi
      .runVerification(transaction.id)
      .pipe(
        finalize(() => this.verifyingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.transactions.update((transactions) =>
            transactions.map((current) =>
              current.id === response.transaction.id ? response.transaction : current,
            ),
          );
          this.captureSuccess.set('Verificación ejecutada.');
        },
        error: (error) => this.captureError.set(httpErrorMessage(error)),
      });
  }

  isInvalid(controlName: keyof typeof this.manualForm.controls): boolean {
    const control = this.manualForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  eventTitle(event: SourceEvent): string {
    return event.normalized?.reference ?? event.externalId ?? event.sourceType;
  }

  eventAmount(event: SourceEvent): number | null {
    return event.normalized?.amount ?? null;
  }

  relative(status: NotifierStatus): string {
    return relativeFromMs(status.sinceMs);
  }

  private buildTransactionRequest(mechanismKind: MechanismKind): CreateTransactionRequest | null {
    this.captureError.set('');

    if (this.manualForm.invalid) {
      this.manualForm.markAllAsTouched();
      return null;
    }

    const raw = this.manualForm.getRawValue();
    const amount = Number(raw.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      this.captureError.set('Ingresa un valor válido para la transacción.');
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
    transaction: PaymentTransaction,
    action: 'CREATED' | 'RETURNED_EXISTING' | 'DUPLICATE_DETECTED',
  ): void {
    this.transactions.update((transactions) => [
      transaction,
      ...transactions.filter((current) => current.id !== transaction.id),
    ]);
    this.captureSuccess.set(
      action === 'CREATED'
        ? 'Transacción creada.'
        : 'Ya existía una transacción con los mismos datos.',
    );
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
    this.loadSourceEvents();
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

  private dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
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
