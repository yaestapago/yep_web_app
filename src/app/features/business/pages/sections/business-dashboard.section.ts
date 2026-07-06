import { CurrencyPipe, DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
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
  LucideChevronDown,
  LucideChevronLeft,
  LucideChevronRight,
  LucideChevronUp,
  LucideInbox,
  LucideListChecks,
  LucideShieldCheck,
  LucideTriangleAlert,
} from '@lucide/angular';
import { finalize, interval } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { BankAccount } from '../../../../shared/models/bank-account.models';
import type {
  DashboardChartsSummary,
  DashboardDateRange,
  DashboardSummary,
} from '../../../../shared/models/dashboard-summary.models';
import type {
  SourceEvent,
  SourceEventFilters,
  SourceEventQuery,
  SourceEventStatus,
  SourceEventType,
} from '../../../../shared/models/source-event.models';
import {
  type ManualReviewDecision,
  PaymentTransaction,
  type TransactionFilters,
  type TransactionStatus,
} from '../../../../shared/models/transaction.models';
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
  DashboardKpiDetailPanel,
  type KpiDetailKind,
} from '../../components/dashboard/dashboard-kpi-detail';
import {
  DashboardStatusPanel,
  type NotifierStatusRow,
  type Semaphore,
} from '../../components/dashboard/dashboard-status';
import { DashboardTransactionsPanel } from '../../components/dashboard/dashboard-transactions';
import { SourceEventDetailModal } from '../../components/dashboard/source-event-detail-modal';
import { TransactionDetailModal } from '../../components/dashboard/transaction-detail-modal';
import { VerifyTransactionModal } from '../../components/dashboard/verify-transaction-modal';
import { DashboardApiService } from '../../services/dashboard-api.service';
import {
  DateRangePicker,
  type DateRangePreset,
  defaultDashboardRange,
} from '../../../../shared/ui/date-range-picker/date-range-picker';

/** Tamaño de página (cursor) de cada tabla. */
const EVENTS_PAGE_LIMIT = 50;
const TRANSACTIONS_PAGE_LIMIT = 100;
/** Respaldo (ms) de re-consulta de notificadores; el push SSE es la vía principal. */
const NOTIFIERS_BACKUP_POLL_MS = 120_000;
const MONEY_REPORT_SOURCE_TYPES: SourceEventType[] = ['NOTIFIER_APP', 'EMAIL_GMAIL'];
const MONEY_REPORT_STATUSES: SourceEventStatus[] = [
  'received',
  'processing',
  'processed',
  'needs_review',
  'failed',
];

const EMPTY_CHARTS: DashboardChartsSummary = {
  bankAmounts: [],
  dailyCaptured: [],
  statusDistribution: [],
  paidVsPending: [],
  eventsBySource: [],
  eventsByStatus: [],
};

const EMPTY_SUMMARY: DashboardSummary = {
  range: defaultDashboardRange(),
  kpis: {
    totalAmount: 0,
    paidCount: 0,
    reviewCount: 0,
    receivedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
    eventsCount: 0,
    attentionCount: 0,
  },
  charts: EMPTY_CHARTS,
  semaphore: {
    level: 'green',
    label: 'Operación normal',
    detail: 'Sin pendientes ni errores.',
  },
  alerts: [],
};

type KpiKey =
  | 'totalAmount'
  | 'paid'
  | 'review'
  | 'events'
  | 'received'
  | 'pending'
  | 'rejected';

/**
 * Panel de control del negocio (`/businesses/:businessId/dashboard`). Pantalla
 * operativa de un solo viewport: métricas + gráficas configurables, estado del
 * sistema (semáforo + notificadores), eventos en lenguaje claro y tabla de
 * transacciones con filtros, detalle y verificación. El scroll vive dentro de
 * cada zona; nunca scrollea la página completa.
 *
 * Los filtros de las tablas se aplican server-side (con cursor para "cargar
 * más"). Los KPIs y el semáforo usan instantáneas SIN filtrar para que sean un
 * resumen estable del negocio, independiente de lo que el usuario esté filtrando
 * en cada tabla.
 */
@Component({
  selector: 'app-business-dashboard-section',
  imports: [
    CurrencyPipe,
    LucideActivity,
    LucideBanknote,
    LucideBell,
    LucideChevronDown,
    LucideChevronLeft,
    LucideChevronRight,
    LucideChevronUp,
    LucideInbox,
    LucideListChecks,
    LucideShieldCheck,
    LucideTriangleAlert,
    DashboardChartsPanel,
    DashboardKpiDetailPanel,
    DashboardStatusPanel,
    DashboardEventsPanel,
    DashboardTransactionsPanel,
    DateRangePicker,
    SourceEventDetailModal,
    TransactionDetailModal,
    VerifyTransactionModal,
  ],
  templateUrl: './business-dashboard.section.html',
  styleUrl: './business-dashboard.section.scss',
})
export class BusinessDashboardSection implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('kpiScroller') private readonly kpiScroller?: ElementRef<HTMLElement>;

  private readonly transactionsApi = inject(TransactionsApiService);
  private readonly dashboardApi = inject(DashboardApiService);
  private readonly sourceEventsApi = inject(SourceEventsApiService);
  private readonly sourceEventsStream = inject(SourceEventsStreamService);
  private readonly notifiersApi = inject(NotifiersApiService);
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly transactionEvents = inject(TransactionEventsService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly thresholds = inject(NOTIFIER_STATUS_THRESHOLDS);
  private readonly document = inject(DOCUMENT);
  private transactionEventsReady = false;
  private businessReady = false;
  private kpiResizeObserver?: ResizeObserver;
  private kpiScrollRaf: number | null = null;

  /** Resumen superior visible u oculto, persistido en localStorage. */
  private static readonly SUMMARY_STORAGE_KEY = 'yep_web.dashboard.summaryVisible';
  readonly summaryVisible = signal<boolean>(this.readSummaryVisible());

  private readonly summaryVisiblePersistEffect = effect(() => {
    const visible = this.summaryVisible();
    this.document.defaultView?.localStorage.setItem(
      BusinessDashboardSection.SUMMARY_STORAGE_KEY,
      visible ? '1' : '0',
    );
  });

  readonly account = computed(() => this.session.activeMembership()?.businessAccount ?? null);
  readonly businessName = computed(() => this.account()?.name?.trim() || 'Negocio sin nombre');
  readonly businessId = computed(() => this.session.activeBusinessAccountId());

  // --- Datos de las tablas (filtrados server-side) ---
  readonly transactions = signal<PaymentTransaction[]>([]);
  readonly sourceEvents = signal<SourceEvent[]>([]);
  readonly notifiers = signal<Notifier[]>([]);

  // --- Instantáneas SIN filtrar para KPIs/semáforo/gráficas ---
  readonly metricsTransactions = signal<PaymentTransaction[]>([]);
  readonly metricsEvents = signal<SourceEvent[]>([]);
  readonly summary = signal<DashboardSummary>(EMPTY_SUMMARY);
  readonly summaryRange = signal<DashboardDateRange>(defaultDashboardRange());
  readonly summaryPreset = signal<DateRangePreset>('today');
  readonly loadingSummary = signal(false);
  readonly summaryError = signal('');

  // --- Filtros + cursor de cada tabla ---
  private readonly eventFilters = signal<SourceEventFilters>({});
  private readonly txFilters = signal<TransactionFilters>({});
  readonly eventsCursor = signal<string | undefined>(undefined);
  readonly txCursor = signal<string | undefined>(undefined);
  readonly loadingMoreEvents = signal(false);
  readonly loadingMoreTransactions = signal(false);
  readonly eventsHasMore = computed(() => this.eventsCursor() !== undefined);
  readonly txHasMore = computed(() => this.txCursor() !== undefined);

  /** Eventos llegados en vivo que encajan en el filtro y esperan ser mostrados. */

  /** IDs de eventos llegados en vivo y aún no vistos (estilo bandeja). */
  readonly unreadEventIds = signal<Set<string>>(new Set());

  /** Cuentas bancarias del negocio, para resolver nombre/plataforma en eventos. */
  readonly bankAccounts = signal<BankAccount[]>([]);
  readonly bankAccountsById = computed(
    () => new Map(this.bankAccounts().map((account) => [account.id, account])),
  );
  /** Bancos del negocio (fuente estable de opciones para los selects). */
  readonly bankOptions = computed(() => {
    const set = new Set<string>();
    for (const account of this.bankAccounts()) {
      if (account.bankId) set.add(account.bankId);
    }
    return [...set].sort();
  });

  readonly loadingTransactions = signal(false);
  readonly loadingEvents = signal(false);
  readonly loadingNotifiers = signal(false);
  readonly transactionsError = signal('');
  readonly eventsError = signal('');
  readonly notifiersError = signal('');

  readonly loadingAny = computed(
    () =>
      this.loadingTransactions() ||
      this.loadingEvents() ||
      this.loadingNotifiers() ||
      this.loadingSummary(),
  );
  readonly canScrollKpisLeft = signal(false);
  readonly canScrollKpisRight = signal(false);

  /** Tick para recalcular el estado relativo de notificadores sin recargar. */
  private readonly now = signal(Date.now());

  // --- Operación (verificación) ---
  readonly verifyTarget = signal<PaymentTransaction | null>(null);
  readonly detailTarget = signal<PaymentTransaction | null>(null);
  readonly eventDetailTarget = signal<SourceEvent | null>(null);
  readonly verifyingId = signal<string | null>(null);
  readonly operationError = signal('');
  readonly operationSuccess = signal('');
  readonly activeKpi = signal<KpiKey | null>(null);
  readonly kpiDetailKind = signal<KpiDetailKind>('transactions');
  readonly kpiDetailTitle = signal('');
  readonly kpiDetailTransactions = signal<PaymentTransaction[]>([]);
  readonly kpiDetailEvents = signal<SourceEvent[]>([]);
  readonly loadingKpiDetail = signal(false);

  private readonly transactionRefreshEffect = effect(() => {
    this.transactionEvents.revision();
    if (!this.transactionEventsReady) {
      this.transactionEventsReady = true;
      return;
    }
    this.loadTransactions();
    this.loadSourceEvents();
    this.loadSummary();
  });

  /**
   * Al cambiar de negocio la ruta reutiliza este componente (mismo route config,
   * otro `:businessId`), así que `ngOnInit` no vuelve a correr. Este effect
   * reacciona al cambio de cuenta activa y recarga todo el dashboard. La primera
   * ejecución la absorbe `ngOnInit` (bandera `businessReady`).
   */
  private readonly businessSwitchEffect = effect(() => {
    const businessId = this.businessId();
    if (!this.businessReady) {
      this.businessReady = true;
      return;
    }
    if (!businessId) {
      return;
    }
    this.refresh();
    this.loadBankAccounts();
  });

  // --- Métricas (7 KPIs) — sobre la instantánea SIN filtrar ---
  readonly totalAmount = computed(() => this.summary().kpis.totalAmount);
  readonly paidCount = computed(() => this.summary().kpis.paidCount);
  readonly reviewCount = computed(() => this.summary().kpis.reviewCount);
  readonly receivedCount = computed(() => this.summary().kpis.receivedCount);
  readonly pendingCount = computed(() => this.summary().kpis.pendingCount);
  readonly rejectedCount = computed(() => this.summary().kpis.rejectedCount);
  readonly eventsCount = computed(() => this.summary().kpis.eventsCount);
  readonly attentionCount = computed(() => this.summary().kpis.attentionCount);

  // --- Estado de notificadores ---
  readonly notifierRows = computed<NotifierStatusRow[]>(() => {
    const now = this.now();
    return this.notifiers().map((notifier) => ({
      notifier,
      status: computeNotifierStatus(notifier, this.thresholds, now),
    }));
  });

  // --- Semáforo global (sobre la instantánea SIN filtrar) ---
  readonly semaphore = computed<Semaphore>(() => {
    const rejected = this.rejectedCount();
    const failedEvents = this.metricsEvents().filter((e) => e.status === 'failed').length;
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

    // Reloj: recalcula los estados relativos de los notificadores para que el
    // paso a "fuera de línea" (silencio, sin heartbeat) aparezca sin recargar.
    // El paso a "en línea" llega instantáneo por SSE (notifier-status).
    interval(this.thresholds.refreshIntervalMs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));

    // Respaldo con intervalo largo: re-consulta la lista por si se perdió algún
    // push SSE o hubo cambios que no vienen por heartbeat (desemparejar,
    // desactivar desde otra sesión).
    interval(NOTIFIERS_BACKUP_POLL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshNotifiers());

    // Eventos en vivo (SSE): aparecen al instante en la lista, sin recargar.
    this.sourceEventsStream.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.onLiveEvent(event));

    // Transacciones en vivo (SSE): actualizan KPIs/semáforo y las filas visibles.
    this.sourceEventsStream.transactions$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((transaction) => this.onLiveTransaction(transaction));

    // Estado de notificadores en vivo (SSE): al latir el dispositivo pasa a verde.
    this.sourceEventsStream.notifierStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notifier) => this.onLiveNotifierStatus(notifier));
  }

  /**
   * Transaccion llegada en vivo. Siempre alimenta las metricas. En la tabla se
   * inserta o actualiza si encaja en el filtro activo, como los eventos.
   */
  private onLiveTransaction(transaction: PaymentTransaction): void {
    this.metricsTransactions.update((list) => this.upsertTransaction(list, transaction));
    this.loadSummary();
    this.transactions.update((list) => {
      const index = list.findIndex((current) => current.id === transaction.id);
      const matches = this.matchesTransactionFilter(transaction, this.txFilters());
      if (index < 0 && !matches) {
        return list;
      }
      if (!matches) {
        return list.filter((current) => current.id !== transaction.id);
      }
      if (index < 0) {
        return [transaction, ...list];
      }
      const next = [...list];
      next[index] = transaction;
      return next;
    });
    this.now.set(Date.now());
  }

  /** Inserta o reemplaza una transacción por id, manteniendo el orden. */
  private upsertTransaction(
    list: PaymentTransaction[],
    transaction: PaymentTransaction,
  ): PaymentTransaction[] {
    const index = list.findIndex((current) => current.id === transaction.id);
    if (index >= 0) {
      const next = [...list];
      next[index] = transaction;
      return next;
    }
    return [transaction, ...list];
  }

  /** La transaccion encaja en el filtro activo de la tabla. */
  private matchesTransactionFilter(
    transaction: PaymentTransaction,
    filters: TransactionFilters,
  ): boolean {
    if (
      filters.bankId &&
      transaction.bankId.toLowerCase() !== filters.bankId.toLowerCase()
    ) {
      return false;
    }
    if (filters.statuses) {
      const statuses = filters.statuses
        .split(',')
        .map((status) => status.trim())
        .filter(Boolean);
      if (statuses.length > 0 && !statuses.includes(transaction.status)) {
        return false;
      }
    }
    if (filters.amountMin !== undefined && transaction.amount < filters.amountMin) {
      return false;
    }
    if (filters.amountMax !== undefined && transaction.amount > filters.amountMax) {
      return false;
    }
    const transactionTime = Date.parse(transaction.transactionDate);
    if (filters.from && transactionTime < Date.parse(filters.from)) {
      return false;
    }
    if (filters.to && transactionTime > Date.parse(filters.to)) {
      return false;
    }
    if (filters.q) {
      const term = filters.q.trim().toLowerCase();
      const reference = (transaction.reference ?? '').toLowerCase();
      if (!reference.startsWith(term)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Estado de notificador llegado en vivo (heartbeat). Actualiza el notificador
   * en el listado para que el semáforo/estado del sistema reflejen "en línea" al
   * instante; el paso a "fuera de línea" (silencio) lo sigue calculando el reloj.
   */
  private onLiveNotifierStatus(notifier: Notifier): void {
    this.notifiers.update((list) => {
      const index = list.findIndex((current) => current.id === notifier.id);
      if (index < 0) {
        return [notifier, ...list];
      }
      const next = [...list];
      next[index] = notifier;
      return next;
    });
    this.now.set(Date.now());
  }

  ngAfterViewInit(): void {
    this.scheduleKpiScrollStateUpdate();

    const element = this.kpiScroller?.nativeElement;
    const ResizeObserverCtor = this.document.defaultView?.ResizeObserver;
    if (!element || !ResizeObserverCtor) {
      return;
    }

    this.kpiResizeObserver = new ResizeObserverCtor(() => this.scheduleKpiScrollStateUpdate());
    this.kpiResizeObserver.observe(element);
  }

  ngOnDestroy(): void {
    this.kpiResizeObserver?.disconnect();
    if (this.kpiScrollRaf !== null) {
      this.document.defaultView?.cancelAnimationFrame(this.kpiScrollRaf);
      this.kpiScrollRaf = null;
    }
  }

  /**
   * Procesa un evento llegado en vivo. Siempre alimenta la instantánea de
   * métricas (para el semáforo). En la tabla solo se ofrece si encaja en el
   * filtro activo: si encaja se acumula en un buffer y se muestra el pill
   * "N nuevos" (sin saltar la vista del usuario); si no encaja, se ignora.
   */
  private onLiveEvent(event: SourceEvent): void {
    if (!this.isMoneyReportEvent(event)) {
      return;
    }

    this.metricsEvents.update((events) => this.upsert(events, event));
    this.loadSummary();
    this.now.set(Date.now());

    if (!this.matchesEventFilter(event, this.eventFilters())) {
      return;
    }
    this.sourceEvents.update((events) => this.upsert(events, event));
    this.unreadEventIds.update((ids) => {
      const next = new Set(ids);
      next.add(event.id);
      return next;
    });
    this.now.set(Date.now());
  }

  /** ¿El evento encaja en el filtro activo de la tabla de eventos? */
  private matchesEventFilter(event: SourceEvent, filters: SourceEventFilters): boolean {
    if (!this.isMoneyReportEvent(event)) {
      return false;
    }
    if (filters.sourceType && event.sourceType !== filters.sourceType) {
      return false;
    }
    if (filters.status && event.status !== filters.status) {
      return false;
    }
    if (
      filters.bankId &&
      (event.normalized?.bankId ?? '').toLowerCase() !== filters.bankId.toLowerCase()
    ) {
      return false;
    }
    if (filters.q) {
      const term = filters.q.trim();
      const digits = term.replace(/\D/g, '');
      const isNumericSearch = digits.length > 0 && !/\p{L}/u.test(term);
      if (isNumericSearch) {
        return event.normalized?.amount === Number(digits);
      }
      const body = this.eventSearchBody(event).toLowerCase();
      return body.includes(term.toLowerCase());
    }
    return true;
  }

  private eventSearchBody(event: SourceEvent): string {
    const notification = event.rawPayload?.['notification'] as
      | { text?: unknown; bigText?: unknown }
      | undefined;
    return [
      notification?.text,
      notification?.bigText,
      event.rawPayload?.['snippet'],
      event.rawPayload?.['bodyText'],
    ]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
  }

  private moneyReportQuery(cursor?: string, includeActiveFilters = true): SourceEventQuery {
    const filters = includeActiveFilters ? this.eventFilters() : {};
    const query: SourceEventQuery = {
      ...filters,
      limit: EVENTS_PAGE_LIMIT,
      cursor,
    };

    if (!filters.sourceType) {
      query.sourceTypes = MONEY_REPORT_SOURCE_TYPES;
    }

    if (!filters.status) {
      query.statuses = MONEY_REPORT_STATUSES;
    }

    return query;
  }

  private isMoneyReportEvent(event: SourceEvent): boolean {
    return (
      MONEY_REPORT_SOURCE_TYPES.includes(event.sourceType) &&
      MONEY_REPORT_STATUSES.includes(event.status)
    );
  }

  /** Inserta o reemplaza un evento por id, manteniendo el orden por recientes. */
  private upsert(events: SourceEvent[], event: SourceEvent): SourceEvent[] {
    const index = events.findIndex((current) => current.id === event.id);
    if (index >= 0) {
      const next = [...events];
      next[index] = event;
      return next;
    }
    return [event, ...events];
  }

  toggleSummary(): void {
    this.summaryVisible.update((visible) => !visible);
    this.scheduleKpiScrollStateUpdate();
  }

  scrollKpis(direction: 'left' | 'right'): void {
    const element = this.kpiScroller?.nativeElement;
    if (!element) {
      return;
    }

    const distance = Math.max(180, Math.floor(element.clientWidth * 0.72));
    element.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
    this.scheduleKpiScrollStateUpdate();
  }

  updateKpiScrollState(): void {
    this.scheduleKpiScrollStateUpdate();
  }

  private scheduleKpiScrollStateUpdate(): void {
    const win = this.document.defaultView;
    if (!win || this.kpiScrollRaf !== null) {
      return;
    }

    this.kpiScrollRaf = win.requestAnimationFrame(() => {
      this.kpiScrollRaf = null;
      this.setKpiScrollState();
    });
  }

  private setKpiScrollState(): void {
    const element = this.kpiScroller?.nativeElement;
    if (!element) {
      this.canScrollKpisLeft.set(false);
      this.canScrollKpisRight.set(false);
      return;
    }

    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    const tolerance = 2;
    this.canScrollKpisLeft.set(element.scrollLeft > tolerance);
    this.canScrollKpisRight.set(maxScrollLeft - element.scrollLeft > tolerance);
  }

  private readSummaryVisible(): boolean {
    const raw = this.document.defaultView?.localStorage.getItem(
      BusinessDashboardSection.SUMMARY_STORAGE_KEY,
    );
    return raw !== '0';
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
    this.loadSummary();
    this.loadNotifiers();
  }

  // --- Filtros (server-side) --------------------------------------------------

  onEventFiltersChange(filters: SourceEventFilters): void {
    this.eventFilters.set(filters);
    this.loadSourceEvents();
  }

  onTransactionFiltersChange(filters: TransactionFilters): void {
    this.txFilters.set(filters);
    this.loadTransactions();
  }

  onSummaryRangeChange(value: { range: DashboardDateRange; preset: DateRangePreset }): void {
    this.summaryRange.set(value.range);
    this.summaryPreset.set(value.preset);
    this.loadSummary();
    const active = this.activeKpi();
    if (active) {
      this.openKpiDetail(active);
    }
  }

  openKpiDetail(key: KpiKey): void {
    this.activeKpi.set(key);
    this.kpiDetailTitle.set(this.kpiTitle(key));
    this.loadingKpiDetail.set(true);
    this.kpiDetailTransactions.set([]);
    this.kpiDetailEvents.set([]);

    if (key === 'events') {
      this.kpiDetailKind.set('events');
      this.sourceEventsApi
        .list({
          sourceTypes: MONEY_REPORT_SOURCE_TYPES,
          statuses: MONEY_REPORT_STATUSES,
          from: this.summaryRange().from,
          to: this.summaryRange().to,
          limit: EVENTS_PAGE_LIMIT,
        })
        .pipe(
          finalize(() => this.loadingKpiDetail.set(false)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: (response) => this.kpiDetailEvents.set(response.sourceEvents),
          error: (error) => this.operationError.set(httpErrorMessage(error)),
        });
      return;
    }

    this.kpiDetailKind.set('transactions');
    this.transactionsApi
      .list({
        from: this.summaryRange().from,
        to: this.summaryRange().to,
        statuses: this.kpiStatuses(key)?.join(','),
        limit: TRANSACTIONS_PAGE_LIMIT,
      })
      .pipe(
        finalize(() => this.loadingKpiDetail.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.kpiDetailTransactions.set(response.transactions),
        error: (error) => this.operationError.set(httpErrorMessage(error)),
      });
  }

  closeKpiDetail(): void {
    this.activeKpi.set(null);
    this.kpiDetailTransactions.set([]);
    this.kpiDetailEvents.set([]);
  }

  private kpiTitle(key: KpiKey): string {
    const titles: Record<KpiKey, string> = {
      totalAmount: 'Detalle de total capturado',
      paid: 'Detalle de pagos validados',
      review: 'Detalle de pagos por revisar',
      events: 'Detalle de eventos detectados',
      received: 'Detalle de transacciones recibidas',
      pending: 'Detalle de pendientes',
      rejected: 'Detalle de rechazadas',
    };
    return titles[key];
  }

  private kpiStatuses(key: KpiKey): TransactionStatus[] | undefined {
    switch (key) {
      case 'paid':
        return ['EVIDENCE_MATCHED', 'BANK_VERIFIED', 'MANUALLY_VERIFIED'];
      case 'review':
        return ['NEEDS_REVIEW', 'EVIDENCE_MATCHED'];
      case 'pending':
        return ['CREATED', 'PENDING_VERIFICATION', 'NEEDS_INPUT'];
      case 'rejected':
        return ['REJECTED', 'DUPLICATE', 'CANCELLED'];
      default:
        return undefined;
    }
  }

  // --- Carga de datos ---------------------------------------------------------

  loadTransactions(): void {
    this.loadingTransactions.set(true);
    this.transactionsError.set('');

    this.transactionsApi
      .list({ ...this.txFilters(), limit: TRANSACTIONS_PAGE_LIMIT })
      .pipe(
        finalize(() => this.loadingTransactions.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.transactions.set(response.transactions);
          this.txCursor.set(response.nextCursor);
          this.now.set(Date.now());
        },
        error: (error) => this.transactionsError.set(httpErrorMessage(error)),
      });
  }

  loadMoreTransactions(): void {
    const cursor = this.txCursor();
    if (!cursor || this.loadingMoreTransactions()) {
      return;
    }
    this.loadingMoreTransactions.set(true);

    this.transactionsApi
      .list({ ...this.txFilters(), limit: TRANSACTIONS_PAGE_LIMIT, cursor })
      .pipe(
        finalize(() => this.loadingMoreTransactions.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.transactions.update((current) => [...current, ...response.transactions]);
          this.txCursor.set(response.nextCursor);
        },
        error: (error) => this.transactionsError.set(httpErrorMessage(error)),
      });
  }

  loadSourceEvents(): void {
    this.loadingEvents.set(true);
    this.eventsError.set('');
    // Al recargar (filtro o refresh) descartamos lo acumulado en vivo: la nueva
    // página ya trae el estado más reciente que encaja en el filtro.
    this.sourceEventsApi
      .list(this.moneyReportQuery())
      .pipe(
        finalize(() => this.loadingEvents.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.sourceEvents.set(response.sourceEvents);
          this.eventsCursor.set(response.nextCursor);
        },
        error: (error) => this.eventsError.set(httpErrorMessage(error)),
      });
  }

  loadMoreEvents(): void {
    const cursor = this.eventsCursor();
    if (!cursor || this.loadingMoreEvents()) {
      return;
    }
    this.loadingMoreEvents.set(true);

    this.sourceEventsApi
      .list(this.moneyReportQuery(cursor))
      .pipe(
        finalize(() => this.loadingMoreEvents.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.sourceEvents.update((current) => [...current, ...response.sourceEvents]);
          this.eventsCursor.set(response.nextCursor);
        },
        error: (error) => this.eventsError.set(httpErrorMessage(error)),
      });
  }

  /** Instantáneas SIN filtrar para KPIs/semáforo (últimas N). */
  private loadMetrics(): void {
    this.transactionsApi
      .list({ limit: TRANSACTIONS_PAGE_LIMIT })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.metricsTransactions.set(response.transactions),
        error: () => {
          /* Los KPIs degradan a 0 silenciosamente; la tabla ya muestra error. */
        },
      });

    this.sourceEventsApi
      .list(this.moneyReportQuery())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.metricsEvents.set(response.sourceEvents),
        error: () => {
          /* idem */
        },
      });
  }

  private loadSummary(): void {
    this.loadingSummary.set(true);
    this.summaryError.set('');
    this.dashboardApi
      .summary(this.summaryRange())
      .pipe(
        finalize(() => this.loadingSummary.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (summary) => this.summary.set(summary),
        error: (error) => this.summaryError.set(httpErrorMessage(error)),
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

  /**
   * Recarga silenciosa de notificadores (sin spinner global) para el
   * auto-refresco periódico: refleja transiciones online/offline sin parpadeo.
   */
  private refreshNotifiers(): void {
    if (!this.session.activeBusinessAccountId()) {
      return;
    }
    this.notifiersApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.notifiers.set(response.notifiers);
          this.now.set(Date.now());
        },
        error: () => undefined,
      });
  }

  // --- Detalle / verificación -------------------------------------------------

  openKpiTransactionDetail(transaction: PaymentTransaction): void {
    this.closeKpiDetail();
    this.openDetail(transaction);
  }

  openKpiEventDetail(event: SourceEvent): void {
    this.closeKpiDetail();
    this.openEventDetail(event);
  }

  openDetail(transaction: PaymentTransaction): void {
    this.detailTarget.set(transaction);
  }

  closeDetail(): void {
    this.detailTarget.set(null);
  }

  openEventDetail(event: SourceEvent): void {
    this.markEventSeen(event.id);
    this.eventDetailTarget.set(event);
  }

  /**
   * Abre el detalle de un evento a partir de su id (lo pide el modal de
   * transacción al hacer click en un soporte de tipo evento bancario). Trae el
   * evento y reutiliza el mismo modal de detalle de evento.
   */
  openEventById(eventId: string): void {
    this.sourceEventsApi
      .get(eventId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.openEventDetail(response.sourceEvent),
        error: (error) => this.operationError.set(httpErrorMessage(error)),
      });
  }

  closeEventDetail(): void {
    this.eventDetailTarget.set(null);
  }

  /**
   * Tras completar datos faltantes desde el modal: refresca el detalle con la
   * transacción actualizada y recarga la lista/métricas.
   */
  onTransactionUpdated(transaction: PaymentTransaction): void {
    this.detailTarget.set(transaction);
    this.transactions.update((transactions) =>
      transactions.map((current) =>
        current.id === transaction.id ? transaction : current,
      ),
    );
    this.transactionEvents.notifyChanged();
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
    this.submitManualDecision(transaction, 'confirmed');
  }

  rejectVerify(transaction: PaymentTransaction): void {
    this.submitManualDecision(transaction, 'rejected');
  }

  private submitManualDecision(
    transaction: PaymentTransaction,
    decision: ManualReviewDecision,
  ): void {
    this.verifyingId.set(transaction.id);
    this.operationError.set('');
    this.operationSuccess.set('');

    this.transactionsApi
      .manualDecision(transaction.id, { decision })
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
          this.operationSuccess.set(
            decision === 'confirmed' ? 'Pago confirmado.' : 'Transacción rechazada.',
          );
          // Recalcula KPIs/semáforo (métricas sin filtrar) y refresca las tablas:
          // "transacciones por atender" cambia al instante, sin recargar.
          this.transactionEvents.notifyChanged();
        },
        error: (error) => this.operationError.set(httpErrorMessage(error)),
      });
  }
}
