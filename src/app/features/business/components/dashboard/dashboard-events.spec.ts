import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { SourceEvent } from '../../../../shared/models/source-event.models';
import { TtsPlaybackService } from '../../../source-events/services/tts-playback.service';
import { DashboardEventsPanel } from './dashboard-events';

function sourceEvent(overrides: Partial<SourceEvent> & Pick<SourceEvent, 'id'>): SourceEvent {
  return {
    accountId: 'acc-1',
    sourceType: 'NOTIFIER_APP',
    rawPayload: {},
    status: 'processed',
    normalized: { bankId: 'nequi', amount: 50000, currency: 'COP' },
    createdAt: '2026-10-06T15:00:00.000Z',
    updatedAt: '2026-10-06T15:00:00.000Z',
    ...overrides,
  };
}

describe('DashboardEventsPanel — un pago, varias fuentes', () => {
  function create(
    events: SourceEvent[],
    inputs: { corroboratedIds?: Set<string> } = {},
  ): ComponentFixture<DashboardEventsPanel> {
    TestBed.configureTestingModule({
      providers: [
        // La voz no se prueba aquí: solo el toggle de la cabecera la usa.
        { provide: TtsPlaybackService, useValue: { enabled: signal(false), setEnabled: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(DashboardEventsPanel);
    fixture.componentRef.setInput('events', events);
    if (inputs.corroboratedIds) {
      fixture.componentRef.setInput('corroboratedIds', inputs.corroboratedIds);
    }
    fixture.detectChanges();
    return fixture;
  }

  function rows(fixture: ComponentFixture<DashboardEventsPanel>): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tr.event'));
  }

  it('muestra "Confirmado por 2 fuentes" cuando dos notificadores reportan el mismo pago', () => {
    const fixture = create([
      sourceEvent({
        id: 'evt-b',
        notifierId: 'phone-2',
        linkedTransactionId: 'tx-1',
        createdAt: '2026-10-06T15:00:05.000Z',
      }),
      sourceEvent({ id: 'evt-a', notifierId: 'phone-1', linkedTransactionId: 'tx-1' }),
    ]);

    const list = rows(fixture);
    expect(list.length).toBe(1);
    expect(list[0].textContent).toContain('Confirmado por 2 fuentes');
    // El tooltip de la píldora explica de dónde salen las 2 fuentes.
    expect(list[0].querySelector('.event__type')?.getAttribute('title')).toBe(
      'App notificadora (2)',
    );
  });

  it('cuenta notificadores distintos: correo + app también son 2 fuentes', () => {
    const fixture = create([
      sourceEvent({ id: 'evt-a', notifierId: 'phone-1', linkedTransactionId: 'tx-1' }),
      sourceEvent({
        id: 'evt-mail',
        sourceType: 'EMAIL_GMAIL',
        notifierId: 'mailbox-1',
        linkedTransactionId: 'tx-1',
      }),
    ]);

    const [row] = rows(fixture);
    expect(row.textContent).toContain('Confirmado por 2 fuentes');
    expect(row.querySelector('.event__type')?.getAttribute('title')).toBe(
      'App notificadora + Correo',
    );
  });

  it('no muestra el rótulo con una sola fuente, aunque ese notificador haya enviado dos avisos', () => {
    const fixture = create([
      sourceEvent({ id: 'evt-a1', notifierId: 'phone-1', linkedTransactionId: 'tx-1' }),
      sourceEvent({ id: 'evt-a2', notifierId: 'phone-1', linkedTransactionId: 'tx-1' }),
      sourceEvent({ id: 'evt-solo', notifierId: 'phone-1' }), // otro pago, sin enlazar
    ]);

    const list = rows(fixture);
    expect(list.length).toBe(2);
    for (const row of list) {
      expect(row.textContent).not.toContain('Confirmado por');
    }
  });

  it('sin notificador, cuenta por tipo de origen', () => {
    const fixture = create([
      sourceEvent({ id: 'evt-app', linkedTransactionId: 'tx-1' }),
      sourceEvent({ id: 'evt-app-2', linkedTransactionId: 'tx-1' }),
      sourceEvent({ id: 'evt-mail', sourceType: 'EMAIL_GMAIL', linkedTransactionId: 'tx-1' }),
    ]);

    expect(rows(fixture)[0].textContent).toContain('Confirmado por 2 fuentes');
  });

  it('resalta la fila del pago mientras dura la corroboración en vivo', () => {
    const fixture = create(
      [
        sourceEvent({
          id: 'evt-b',
          notifierId: 'phone-2',
          linkedTransactionId: 'tx-1',
          createdAt: '2026-10-06T15:00:05.000Z',
        }),
        sourceEvent({ id: 'evt-a', notifierId: 'phone-1', linkedTransactionId: 'tx-1' }),
        sourceEvent({ id: 'evt-other', notifierId: 'phone-1', linkedTransactionId: 'tx-2' }),
      ],
      { corroboratedIds: new Set(['evt-b']) },
    );

    const [paymentRow, otherRow] = rows(fixture);
    expect(paymentRow.classList).toContain('event--corroborated');
    expect(otherRow.classList).not.toContain('event--corroborated');

    fixture.componentRef.setInput('corroboratedIds', new Set());
    fixture.detectChanges();
    expect(paymentRow.classList).not.toContain('event--corroborated');
  });

  it('marca "vía SMS" el pago que llegó por el respaldo SMS (aunque otra fuente lo confirme)', () => {
    const fixture = create([
      sourceEvent({
        id: 'evt-sms',
        notifierId: 'phone-1',
        linkedTransactionId: 'tx-1',
        transport: 'sms',
      }),
      sourceEvent({
        id: 'evt-mail',
        sourceType: 'EMAIL_GMAIL',
        notifierId: 'mailbox-1',
        linkedTransactionId: 'tx-1',
      }),
      sourceEvent({ id: 'evt-net', notifierId: 'phone-1', linkedTransactionId: 'tx-2' }),
    ]);

    const [smsRow, internetRow] = rows(fixture);
    expect(smsRow.querySelector('[data-testid="via-sms"]')?.textContent?.trim()).toBe('vía SMS');
    expect(internetRow.querySelector('[data-testid="via-sms"]')).toBeNull();
  });
});

/**
 * jsdom no calcula layout, así que aquí se simula el navegador a mano: el
 * cuerpo de la zona (`.events-body`) mide BODY px, el encabezado de la tabla
 * HEADER, cada fila ROW y el botón "Cargar más", cuando está en el DOM, le
 * resta BUTTON al cuerpo (es un hermano en la misma columna flex). El
 * ResizeObserver y requestAnimationFrame se disparan frame a frame desde la
 * prueba, igual que haría el navegador tras cada cambio de tamaño.
 */
describe('DashboardEventsPanel — paginado ajustado al alto (appAutoFitRows)', () => {
  const ROW = 56;
  const HEADER = 40;
  const BUTTON = 42;
  /** Sin el botón caben 7 filas; con el botón, solo 6. */
  const BODY = HEADER + 7 * ROW + 20;

  let resize: ResizeObserverCallback | undefined;
  let frames: FrameRequestCallback[] = [];

  beforeEach(() => {
    frames = [];
    resize = undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: ROW,
    } as DOMRect);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(HEADER);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function create(count: number): ComponentFixture<DashboardEventsPanel> {
    TestBed.configureTestingModule({
      providers: [
        { provide: TtsPlaybackService, useValue: { enabled: signal(false), setEnabled: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(DashboardEventsPanel);
    const events = Array.from({ length: count }, (_, index) =>
      sourceEvent({
        id: `evt-${index}`,
        createdAt: new Date(Date.UTC(2026, 9, 6, 15, 0, count - index)).toISOString(),
      }),
    );
    fixture.componentRef.setInput('events', events);
    fixture.componentRef.setInput('hasMore', true);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const body = host.querySelector<HTMLElement>('.events-body');
    if (!body) throw new Error('falta .events-body');
    Object.defineProperty(body, 'clientHeight', {
      get: () => BODY - (host.querySelector('.load-more') ? BUTTON : 0),
    });
    return fixture;
  }

  /**
   * Un "frame" del navegador: si el cuerpo cambió de alto desde el último
   * layout, avisa al ResizeObserver; luego corre los rAF pendientes (la
   * medición de la directiva) y refresca la vista. Devuelve si el tamaño de
   * página cambió en este frame.
   */
  function makeFrameRunner(fixture: ComponentFixture<DashboardEventsPanel>) {
    const host = fixture.nativeElement as HTMLElement;
    const body = host.querySelector<HTMLElement>('.events-body');
    if (!body) throw new Error('falta .events-body');
    let lastHeight = -1;
    return (): boolean => {
      const before = fixture.componentInstance.pageSize();
      const height = body.clientHeight;
      if (height !== lastHeight) {
        lastHeight = height;
        resize?.([], {} as ResizeObserver);
      }
      for (const callback of frames.splice(0)) callback(0);
      fixture.detectChanges();
      return fixture.componentInstance.pageSize() !== before;
    };
  }

  /** Corre frames hasta que dos seguidos no cambien el tamaño de página (o se agote `max`). */
  function settle(frame: () => boolean, max = 12): number {
    let changes = 0;
    let quiet = 0;
    for (let i = 0; i < max && quiet < 2; i++) {
      if (frame()) {
        changes++;
        quiet = 0;
      } else {
        quiet++;
      }
    }
    return changes;
  }

  it('ajusta el tamaño de página a las filas que caben', () => {
    const fixture = create(50);
    const frame = makeFrameRunner(fixture);

    settle(frame);

    // Con "Cargar más" presente caben 6 filas (BODY − BUTTON − HEADER) / ROW.
    expect(fixture.componentInstance.pageSize()).toBe(6);
    expect(rowsOf(fixture).length).toBe(6);
  });

  it('no oscila al llegar a la última página cargada cuando hay más en el servidor', () => {
    const fixture = create(50);
    const frame = makeFrameRunner(fixture);
    settle(frame);
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('button[aria-label="Última página"]')?.click();
    fixture.detectChanges();

    // Si el botón "Cargar más" solo existe en la última página, su aparición
    // encoge el cuerpo → caben menos filas → la última página deja de serlo →
    // el botón desaparece → vuelven a caber más → … El layout nunca se asienta
    // y el usuario ve el paginado "trabado" (parpadea y el botón se esfuma).
    const changes = settle(frame);
    expect(changes).toBe(0);

    const panel = fixture.componentInstance;
    expect(panel.currentPage()).toBe(panel.totalPages());
    expect(host.querySelector('.load-more')).not.toBeNull();
  });

  it('ofrece "Cargar más" mientras el servidor tenga más eventos y pide la siguiente página al pulsarlo', () => {
    const fixture = create(50);
    const frame = makeFrameRunner(fixture);
    settle(frame);
    const host = fixture.nativeElement as HTMLElement;
    const loadMore = vi.fn();
    fixture.componentInstance.loadMore.subscribe(loadMore);

    host.querySelector<HTMLButtonElement>('.load-more')?.click();
    expect(loadMore).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('hasMore', false);
    fixture.detectChanges();
    expect(host.querySelector('.load-more')).toBeNull();
  });

  function rowsOf(fixture: ComponentFixture<DashboardEventsPanel>): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tr.event'));
  }
});

describe('DashboardEventsPanel — filtro de estado "Por revisar"', () => {
  function create(inputs: { reviewCount?: number } = {}): ComponentFixture<DashboardEventsPanel> {
    TestBed.configureTestingModule({
      providers: [
        { provide: TtsPlaybackService, useValue: { enabled: signal(false), setEnabled: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(DashboardEventsPanel);
    fixture.componentRef.setInput('events', [sourceEvent({ id: 'evt-1' })]);
    if (inputs.reviewCount !== undefined) {
      fixture.componentRef.setInput('reviewCount', inputs.reviewCount);
    }
    fixture.detectChanges();
    return fixture;
  }

  function tab(fixture: ComponentFixture<DashboardEventsPanel>, label: string): HTMLButtonElement {
    const tabs = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.status-filter [role="tab"]',
      ),
    );
    const found = tabs.find((button) => button.textContent?.includes(label));
    if (!found) throw new Error(`falta la opción "${label}"`);
    return found;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ofrece "Todos" y "Por revisar", con el contador solo cuando hay algo por revisar', () => {
    const fixture = create({ reviewCount: 3 });

    expect(tab(fixture, 'Todos').getAttribute('aria-selected')).toBe('true');
    expect(
      tab(fixture, 'Por revisar').querySelector('.yep-segmented__count')?.textContent?.trim(),
    ).toBe('3');

    fixture.componentRef.setInput('reviewCount', 0);
    fixture.detectChanges();
    expect(tab(fixture, 'Por revisar').querySelector('.yep-segmented__count')).toBeNull();
  });

  it('al elegir "Por revisar" pide al servidor solo ese estado y vuelve a la página 1', () => {
    vi.useFakeTimers();
    const fixture = create();
    const panel = fixture.componentInstance;
    const filtersChange = vi.fn();
    panel.filtersChange.subscribe(filtersChange);
    panel.page.set(3);

    tab(fixture, 'Por revisar').click();
    fixture.detectChanges();
    expect(panel.statusFilter()).toBe('needs_review');
    expect(tab(fixture, 'Por revisar').getAttribute('aria-selected')).toBe('true');
    expect(panel.page()).toBe(1);

    // El filtro viaja a la sección con debounce (recarga server-side).
    vi.advanceTimersByTime(300);
    expect(filtersChange).toHaveBeenCalledTimes(1);
    expect(filtersChange.mock.calls[0][0]).toMatchObject({ status: 'needs_review' });

    tab(fixture, 'Todos').click();
    fixture.detectChanges();
    vi.advanceTimersByTime(300);
    expect(filtersChange).toHaveBeenCalledTimes(2);
    expect(filtersChange.mock.calls[1][0].status).toBeUndefined();
  });

  it('con "Por revisar" y sin eventos, explica que no hay nada por revisar', () => {
    const fixture = create();
    fixture.componentInstance.statusFilter.set('needs_review');
    fixture.componentRef.setInput('events', []);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nada por revisar');
  });
});
