import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { DashboardSummary } from '../../../../shared/models/dashboard-summary.models';
import type {
  SourceEvent,
  SourceEventQuery,
  SourceEventsResponse,
} from '../../../../shared/models/source-event.models';
import { NotifiersApiService } from '../../../notifiers/services/notifiers-api.service';
import { SourceEventsApiService } from '../../../source-events/services/source-events-api.service';
import { SourceEventsStreamService } from '../../../source-events/services/source-events-stream.service';
import { TtsPlaybackService } from '../../../source-events/services/tts-playback.service';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';
import { DashboardApiService } from '../../services/dashboard-api.service';
import { BusinessDashboardSection } from './business-dashboard.section';

function sourceEvent(overrides: Partial<SourceEvent> & Pick<SourceEvent, 'id'>): SourceEvent {
  return {
    accountId: 'acc-1',
    sourceType: 'NOTIFIER_APP',
    rawPayload: {},
    status: 'processed',
    normalized: { bankId: 'nequi', amount: 50000, currency: 'COP' },
    createdAt: '2026-10-17T15:00:00.000Z',
    updatedAt: '2026-10-17T15:00:00.000Z',
    ...overrides,
  };
}

const ids = (events: SourceEvent[]): string[] => events.map((event) => event.id);

/**
 * Cubre el filtro "Por revisar" de la tabla de eventos: la consulta al
 * servidor (solo ese estado, con su propio cursor), los eventos en vivo que
 * deben respetar el filtro y el contador del chip, que se carga aparte de la
 * lista y se mantiene al día en vivo.
 */
describe('BusinessDashboardSection — eventos "Por revisar"', () => {
  const summary = {
    range: { from: '2026-10-17', to: '2026-10-17' },
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
    charts: {
      todayVsLastWeek: { today: 0, lastWeek: 0, todayDate: '', lastWeekDate: '' },
      hourlyHeatmap: [],
      topCustomers: [],
      weeklyTrend: [],
      notificationLatency: [],
    },
    semaphore: { level: 'green', label: 'Operación normal', detail: '' },
    alerts: [],
  } as unknown as DashboardSummary;

  const session = {
    activeBusinessAccountId: signal('biz-1'),
    activeMembership: signal({ role: 'account_owner', businessAccount: { name: 'Café Central' } }),
    isSuperUser: signal(false),
  };

  const processed = sourceEvent({ id: 'processed-1', createdAt: '2026-10-17T15:00:02.000Z' });
  const review = sourceEvent({
    id: 'review-1',
    status: 'needs_review',
    createdAt: '2026-10-17T15:00:01.000Z',
  });
  /** Un "Por revisar" viejo: ya no cabe en la primera página de la lista. */
  const reviewOld = sourceEvent({
    id: 'review-old',
    status: 'needs_review',
    createdAt: '2026-10-10T09:00:00.000Z',
  });

  let events$: Subject<SourceEvent>;

  /**
   * Servidor simulado: la primera página de "todos" trae `all`; la de "Por
   * revisar", `review`. Cada una tiene su propio cursor y la segunda página
   * de cualquiera llega vacía.
   */
  function listMock(windows: { all: SourceEvent[]; review: SourceEvent[] }) {
    return vi.fn((query: SourceEventQuery) => {
      const reviewOnly = query.status === 'needs_review';
      const response: SourceEventsResponse = query.cursor
        ? { sourceEvents: [] }
        : {
            sourceEvents: reviewOnly ? windows.review : windows.all,
            nextCursor: reviewOnly ? 'cursor-review' : 'cursor-all',
          };
      return of(response);
    });
  }

  function create(list: ReturnType<typeof listMock>): BusinessDashboardSection {
    events$ = new Subject<SourceEvent>();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthSessionService, useValue: session },
        { provide: SourceEventsApiService, useValue: { list, get: vi.fn() } },
        {
          provide: SourceEventsStreamService,
          useValue: {
            events$: events$.asObservable(),
            transactions$: new Subject().asObservable(),
            notifierStatus$: new Subject().asObservable(),
            connected: signal(false),
          },
        },
        { provide: TtsPlaybackService, useValue: { speak: vi.fn(), enabled: signal(false) } },
        {
          provide: TransactionsApiService,
          useValue: { list: vi.fn(() => of({ transactions: [] })), manualDecision: vi.fn() },
        },
        { provide: DashboardApiService, useValue: { summary: vi.fn(() => of(summary)) } },
        { provide: NotifiersApiService, useValue: { list: vi.fn(() => of({ notifiers: [] })) } },
        {
          provide: BusinessAccountsApiService,
          useValue: { listBankAccounts: vi.fn(() => of({ bankAccounts: [] })) },
        },
      ],
    });
    const section = TestBed.runInInjectionContext(() => new BusinessDashboardSection());
    section.ngOnInit();
    return section;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('con "Por revisar" consulta al servidor solo ese estado y pagina con su propio cursor', () => {
    const list = listMock({ all: [processed, review], review: [review, reviewOld] });
    const section = create(list);

    // Carga inicial: todos los estados de ingreso, sin cursor.
    const initial = list.mock.calls[0][0];
    expect(initial.statuses).toEqual([
      'received',
      'processing',
      'processed',
      'needs_review',
      'failed',
    ]);
    expect(initial.status).toBeUndefined();
    expect(initial.cursor).toBeUndefined();
    expect(ids(section.sourceEvents())).toEqual(['processed-1', 'review-1']);

    list.mockClear();
    section.onEventFiltersChange({ status: 'needs_review' });
    // Una sola consulta: con el filtro puesto la lista es también la ventana del contador.
    expect(list).toHaveBeenCalledTimes(1);
    const filtered = list.mock.calls[0][0];
    expect(filtered.status).toBe('needs_review');
    expect(filtered.statuses).toBeUndefined();
    expect(filtered.cursor).toBeUndefined();
    expect(ids(section.sourceEvents())).toEqual(['review-1', 'review-old']);
    expect(section.eventsHasMore()).toBe(true);

    list.mockClear();
    section.loadMoreEvents();
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'needs_review', cursor: 'cursor-review' }),
    );
    expect(section.eventsHasMore()).toBe(false);
  });

  it('los eventos en vivo respetan el filtro: entra lo "Por revisar", no lo procesado, y sale lo que se resolvió', () => {
    const section = create(listMock({ all: [processed, review], review: [review] }));
    section.onEventFiltersChange({ status: 'needs_review' });

    events$.next(sourceEvent({ id: 'live-ok', status: 'processed' }));
    expect(ids(section.sourceEvents())).toEqual(['review-1']);

    events$.next(sourceEvent({ id: 'live-review', status: 'needs_review' }));
    expect(ids(section.sourceEvents())).toEqual(['live-review', 'review-1']);
    expect(section.unreadEventIds().has('live-review')).toBe(true);

    // Reemisión: el pago ya se asignó a una cuenta, deja de estar por revisar.
    events$.next(sourceEvent({ id: 'review-1', status: 'processed', linkedTransactionId: 'tx-1' }));
    expect(ids(section.sourceEvents())).toEqual(['live-review']);
  });

  it('cuenta los "Por revisar" aparte de la lista y los mantiene al día en vivo', () => {
    const list = listMock({ all: [processed, review], review: [review, reviewOld] });
    const section = create(list);

    // El viejo no está en la primera página de la lista, pero sí cuenta.
    expect(list).toHaveBeenCalledTimes(2);
    expect(section.needsReviewCount()).toBe(2);

    events$.next(sourceEvent({ id: 'live-review', status: 'needs_review' }));
    expect(section.needsReviewCount()).toBe(3);

    events$.next(
      sourceEvent({ id: 'review-old', status: 'processed', linkedTransactionId: 'tx-2' }),
    );
    expect(section.needsReviewCount()).toBe(2);

    // Con "Todos" activo el resuelto sigue en la lista, ya con su estado nuevo.
    expect(section.sourceEvents().find((event) => event.id === 'review-old')?.status).toBe(
      'processed',
    );
  });

  it('staff con tope: el pago en vivo saca al más viejo de su filtro y no toca los demás', () => {
    const owner = session.activeMembership();
    session.activeMembership.set({
      role: 'account_staff',
      businessAccount: { name: 'Café Central' },
      sourceEventAccess: {
        enabled: true,
        bankAccountIds: [],
        allowedBreBKeys: ['direct-account:ba-1', '0090995395'],
        filterLimits: [{ filter: 'direct-account:ba-1', limit: 2 }],
      },
    } as never);
    try {
      const direct = (id: string, createdAt: string) =>
        sourceEvent({ id, reportedBankAccountId: 'ba-1', createdAt });
      const keyed = sourceEvent({
        id: 'llave-vieja',
        reportedBankAccountId: 'ba-1',
        normalized: { bankId: 'bancolombia', receiverBreBKey: '0090995395' },
        createdAt: '2026-10-01T10:00:00.000Z',
      });
      const section = create(
        listMock({
          all: [
            direct('directa-2', '2026-10-17T15:00:02.000Z'),
            direct('directa-1', '2026-10-17T15:00:01.000Z'),
            keyed,
          ],
          review: [],
        }),
      );

      events$.next(direct('directa-3', '2026-10-17T15:00:03.000Z'));

      expect(ids(section.sourceEvents())).toEqual(['directa-3', 'directa-2', 'llave-vieja']);
    } finally {
      session.activeMembership.set(owner);
    }
  });
});
