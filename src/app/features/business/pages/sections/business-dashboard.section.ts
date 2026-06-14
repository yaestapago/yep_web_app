import { CurrencyPipe, DatePipe, PercentPipe } from '@angular/common';
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
  LucideLoaderCircle,
  LucideRefreshCw,
  LucideShieldCheck,
  LucideTriangleAlert,
} from '@lucide/angular';
import { finalize, interval } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { SourceEvent } from '../../../../shared/models/source-event.models';
import { PaymentTransaction } from '../../../../shared/models/transaction.models';
import type { Notifier } from '../../../../shared/models/notifier.models';
import {
  NOTIFIER_STATUS_THRESHOLDS,
  computeNotifierStatus,
  relativeFromMs,
  type NotifierStatus,
  type NotifierStatusLevel,
} from '../../../../shared/utils/notifier-status';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { NotifiersApiService } from '../../../notifiers/services/notifiers-api.service';
import { SourceEventsApiService } from '../../../source-events/services/source-events-api.service';
import { TransactionEventsService } from '../../../transactions/services/transaction-events.service';
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
 * compacto de notificadores, transacciones y eventos recientes. La captura de
 * comprobantes está disponible globalmente desde el botón flotante de la app.
 */
@Component({
  selector: 'app-business-dashboard-section',
  imports: [
    CurrencyPipe,
    DatePipe,
    PercentPipe,
    LucideActivity,
    LucideBanknote,
    LucideBell,
    LucideLoaderCircle,
    LucideRefreshCw,
    LucideShieldCheck,
    LucideTriangleAlert,
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
  private readonly transactionEvents = inject(TransactionEventsService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly thresholds = inject(NOTIFIER_STATUS_THRESHOLDS);
  private transactionEventsReady = false;

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

  runVerification(transaction: PaymentTransaction): void {
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
          this.operationSuccess.set('Verificación ejecutada.');
        },
        error: (error) => this.operationError.set(httpErrorMessage(error)),
      });
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

  private dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }
}
