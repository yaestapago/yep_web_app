import { CurrencyPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideActivity,
  LucideBanknote,
  LucideBell,
  LucideInbox,
  LucideListChecks,
  LucideShieldCheck,
  LucideTriangleAlert,
} from '@lucide/angular';
import { finalize, interval } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { BankAccount } from '../../../../shared/models/bank-account.models';
import type { SourceEvent } from '../../../../shared/models/source-event.models';
import { PaymentTransaction } from '../../../../shared/models/transaction.models';
import type { Notifier } from '../../../../shared/models/notifier.models';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';
import {
  NOTIFIER_STATUS_THRESHOLDS,
  computeNotifierStatus,
} from '../../../../shared/utils/notifier-status';
import { transactionCategory } from '../../../../shared/utils/transaction-status';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { NotifiersApiService } from '../../../notifiers/services/notifiers-api.service';
import { SourceEventsApiService } from '../../../source-events/services/source-events-api.service';
import { SourceEventsStreamService } from '../../../source-events/services/source-events-stream.service';
import { TransactionEventsService } from '../../../transactions/services/transaction-events.service';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';
import { DashboardChartsPanel } from '../../components/dashboard/dashboard-charts';
import { DashboardEventsPanel } from '../../components/dashboard/dashboard-events';
import {
  DashboardStatusPanel,
  type NotifierStatusRow,
  type Semaphore,
} from '../../components/dashboard/dashboard-status';
import { DashboardTransactionsPanel } from '../../components/dashboard/dashboard-transactions';
import { TransactionDetailModal } from '../../components/dashboard/transaction-detail-modal';
import { VerifyTransactionModal } from '../../components/dashboard/verify-transaction-modal';

/**
 * Panel de control del negocio (`/businesses/:businessId/dashboard`). Pantalla
 * operativa de un solo viewport: métricas + gráficas configurables, estado del
 * sistema (semáforo + notificadores), eventos en lenguaje claro y tabla de
 * transacciones con filtros, detalle y verificación. El scroll vive dentro de
 * cada zona; nunca scrollea la página completa.
 */
@Component({
  selector: 'app-business-dashboard-section',
  imports: [
    CurrencyPipe,
    LucideActivity,
    LucideBanknote,
    LucideBell,
    LucideInbox,
    LucideListChecks,
    LucideShieldCheck,
    LucideTriangleAlert,
    DashboardChartsPanel,
    DashboardStatusPanel,
    DashboardEventsPanel,
    DashboardTransactionsPanel,
    TransactionDetailModal,
    VerifyTransactionModal,
  ],
  templateUrl: './business-dashboard.section.html',
  styleUrl: './business-dashboard.section.scss',
})
export class BusinessDashboardSection implements OnInit {
  private readonly transactionsApi = inject(TransactionsApiService);
  private readonly sourceEventsApi = inject(SourceEventsApiService);
  private readonly sourceEventsStream = inject(SourceEventsStreamService);
  private readonly notifiersApi = inject(NotifiersApiService);
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly transactionEvents = inject(TransactionEventsService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly thresholds = inject(NOTIFIER_STATUS_THRESHOLDS);
  private transactionEventsReady = false;

  readonly account = computed(() => this.session.activeMembership()?.businessAccount ?? null);
  readonly businessName = computed(() => this.account()?.name?.trim() || 'Negocio sin nombre');
  readonly businessId = computed(() => this.session.activeBusinessAccountId());

  // --- Datos ---
  readonly transactions = signal<PaymentTransaction[]>([]);
  readonly sourceEvents = signal<SourceEvent[]>([]);
  readonly notifiers = signal<Notifier[]>([]);

  /** IDs de eventos llegados en vivo y aún no vistos (estilo bandeja). */
  readonly unreadEventIds = signal<Set<string>>(new Set());

  /** Cuentas bancarias del negocio, para resolver nombre/plataforma en eventos. */
  readonly bankAccounts = signal<BankAccount[]>([]);
  readonly bankAccountsById = computed(
    () => new Map(this.bankAccounts().map((account) => [account.id, account])),
  );

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

  // --- Operación (verificación) ---
  readonly verifyTarget = signal<PaymentTransaction | null>(null);
  readonly detailTarget = signal<PaymentTransaction | null>(null);
  readonly verifyingId = signal<string | null>(null);
  readonly operationError = signal('');
  readonly operationSuccess = signal('');

  private readonly transactionRefreshEffect = effect(() => {
    this.transactionEvents.revision();
    if (!this.transactionEventsReady) {
      this.transactionEventsReady = true;
      return;
    }
    this.loadTransactions();
    this.loadSourceEvents();
  });

  // --- Métricas (7 KPIs) ---
  readonly totalAmount = computed(() =>
    this.transactions().reduce((total, transaction) => total + transaction.amount, 0),
  );
  readonly paidCount = computed(
    () => this.transactions().filter((t) => t.verification.canBeConsideredPaid).length,
  );
  readonly reviewCount = computed(
    () => this.transactions().filter((t) => t.status === 'NEEDS_REVIEW').length,
  );
  readonly receivedCount = computed(() => this.transactions().length);
  readonly pendingCount = computed(
    () =>
      this.transactions().filter((t) =>
        ['CREATED', 'PENDING_VERIFICATION'].includes(t.status),
      ).length,
  );
  readonly rejectedCount = computed(
    () => this.transactions().filter((t) => transactionCategory(t.status) === 'rechazada').length,
  );
  readonly eventsCount = computed(() => this.sourceEvents().length);

  // --- Estado de notificadores ---
  readonly notifierRows = computed<NotifierStatusRow[]>(() => {
    const now = this.now();
    return this.notifiers().map((notifier) => ({
      notifier,
      status: computeNotifierStatus(notifier, this.thresholds, now),
    }));
  });

  // --- Semáforo global ---
  readonly semaphore = computed<Semaphore>(() => {
    const rejected = this.rejectedCount();
    const failedEvents = this.sourceEvents().filter((e) => e.status === 'failed').length;
    const offline = this.notifierRows().filter((r) => r.status.level === 'offline').length;
    const pending = this.pendingCount() + this.reviewCount();
    const delayed = this.notifierRows().filter(
      (r) => r.status.level === 'delayed' || r.status.level === 'unknown',
    ).length;

    if (rejected > 0 || failedEvents > 0 || offline > 0) {
      const reasons: string[] = [];
      if (rejected > 0) reasons.push(`${rejected} rechazada(s)`);
      if (failedEvents > 0) reasons.push(`${failedEvents} evento(s) con error`);
      if (offline > 0) reasons.push(`${offline} notificador(es) fuera de línea`);
      return { level: 'red', label: 'Atención requerida', detail: reasons.join(' · ') };
    }

    if (pending > 0 || delayed > 0) {
      const reasons: string[] = [];
      if (pending > 0) reasons.push(`${pending} pago(s) por revisar`);
      if (delayed > 0) reasons.push(`${delayed} notificador(es) con retraso`);
      return { level: 'yellow', label: 'Con pendientes', detail: reasons.join(' · ') };
    }

    return { level: 'green', label: 'Operación normal', detail: 'Sin pendientes ni errores.' };
  });

  ngOnInit(): void {
    this.refresh();
    this.loadBankAccounts();

    interval(this.thresholds.refreshIntervalMs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));

    // Eventos en vivo (SSE): aparecen al instante en la lista, sin recargar.
    this.sourceEventsStream.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.onLiveEvent(event));
  }

  /** Inserta/actualiza un evento llegado en vivo y lo marca como no leído. */
  private onLiveEvent(event: SourceEvent): void {
    this.sourceEvents.update((events) => {
      const index = events.findIndex((current) => current.id === event.id);
      if (index >= 0) {
        const next = [...events];
        next[index] = event;
        return next;
      }
      return [event, ...events];
    });
    this.unreadEventIds.update((ids) => new Set(ids).add(event.id));
    this.now.set(Date.now());
  }

  /** Marca un evento como visto (al abrirlo en la lista, estilo bandeja). */
  markEventSeen(eventId: string): void {
    if (!this.unreadEventIds().has(eventId)) {
      return;
    }
    this.unreadEventIds.update((ids) => {
      const next = new Set(ids);
      next.delete(eventId);
      return next;
    });
  }

  loadBankAccounts(): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }
    this.businessApi
      .listBankAccounts(businessId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.bankAccounts.set(response.bankAccounts),
        error: () => this.bankAccounts.set([]),
      });
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

  // --- Detalle / verificación -------------------------------------------------

  openDetail(transaction: PaymentTransaction): void {
    this.detailTarget.set(transaction);
  }

  closeDetail(): void {
    this.detailTarget.set(null);
  }

  askVerify(transaction: PaymentTransaction): void {
    this.operationError.set('');
    this.operationSuccess.set('');
    this.verifyTarget.set(transaction);
  }

  cancelVerify(): void {
    this.verifyTarget.set(null);
  }

  confirmVerify(transaction: PaymentTransaction): void {
    this.verifyingId.set(transaction.id);
    this.operationError.set('');
    this.operationSuccess.set('');

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
          this.verifyTarget.set(null);
          this.operationSuccess.set('Verificación registrada.');
        },
        error: (error) => this.operationError.set(httpErrorMessage(error)),
      });
  }
}
