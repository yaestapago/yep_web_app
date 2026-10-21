import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import type {
  Notifier,
  NotifierCaptureHistoryEntry,
  NotifierCaptureSnapshot,
  NotifierDiagnosticsResponse,
} from '../../../../shared/models/notifier.models';
import { NotifiersApiService } from '../../../notifiers/services/notifiers-api.service';
import {
  CONVERSATIONS_BLOCKED_DETAIL,
  NotifierDiagnosticsModal,
  SELF_TEST_REASON_COPY,
  SMS_HIDDEN_INSTRUCTION,
  SMS_QUIET_DETAIL,
  TIMELINE_BUCKETS,
  conversationsFlag,
  flagFor,
  seenByPackageEntries,
  selfTestReasonCopy,
  smsHiddenDetail,
  smsHiddenFlag,
  summarizeTimeline,
  topSeenApps,
  watchedPackageSet,
} from './notifier-diagnostics-modal';

const NOW = new Date('2026-10-13T15:00:00.000Z');

function iso(minutesAgo: number): string {
  return new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();
}

function notifier(overrides: Partial<Notifier> = {}): Notifier {
  return {
    id: 'n1',
    accountId: 'a1',
    type: 'phone_app',
    displayName: 'Caja',
    bankIds: ['bancolombia'],
    bankAccountIds: [],
    allowedBreBKeys: [],
    bankAccounts: [],
    watchedPackages: ['@default_sms', 'com.nequi.MobileApp'],
    active: true,
    pairingVersion: 1,
    pairedDevice: {
      deviceId: 'd1',
      manufacturer: 'Xiaomi',
      model: 'Redmi 12',
      appVersion: '1.0.8',
      defaultSmsPackage: 'com.android.mms',
      pairedAt: '2026-10-01T12:00:00.000Z',
    },
    deviceHistory: [],
    isOnline: true,
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

function capture(overrides: Partial<NotifierCaptureSnapshot> = {}): NotifierCaptureSnapshot {
  return {
    at: iso(1),
    source: 'foreground',
    captureActive: true,
    listenerConnected: true,
    listenerConnectedAt: iso(120),
    listenerDisconnectedAt: null,
    permissionGranted: true,
    notificationsEnabled: true,
    componentEnabled: true,
    serviceRunning: true,
    batteryUnrestricted: true,
    processStartedAt: iso(180),
    seenTotal: 96,
    // Como lo manda el backend: arreglo ordenado desc y solo apps vigiladas
    // (banco, SMS y la propia app); `seenTotal` sí cuenta todas.
    seenByPackage: [
      { packageName: 'com.android.mms', count: 12 },
      { packageName: 'com.nequi.mobileapp', count: 4 },
      { packageName: 'co.yaestapago.notifier', count: 2 },
    ],
    lastNotificationPackage: 'com.nequi.mobileapp',
    receiver: {
      received: 16,
      accepted: 3,
      nearMiss: 1,
      ignored: 12,
      noRules: 0,
      lastReceivedAt: iso(5),
      lastStoredAt: iso(40),
      inboxPending: 0,
      rulesLoaded: true,
    },
    rebindAttempts: 0,
    lastRebindAt: null,
    selfTest: { at: iso(30), ok: true, latencyMs: 230 },
    ...overrides,
  };
}

function history(states: boolean[], stepMinutes = 5): NotifierCaptureHistoryEntry[] {
  // Del más viejo al más nuevo, un latido cada `stepMinutes`; el último hace `stepMinutes`.
  return states.map((captureActive, index) => ({
    at: iso((states.length - index) * stepMinutes),
    source: 'foreground',
    captureActive,
    listenerConnected: captureActive,
  }));
}

describe('helpers del diagnóstico de escucha', () => {
  it('flagFor: ícono + palabra según el booleano; sin dato cuando la app no lo reporta', () => {
    expect(flagFor(true, 'Conectado', 'Desconectado')).toEqual({
      kind: 'ok',
      tone: 'success',
      label: 'Conectado',
    });
    expect(flagFor(false, 'Conectado', 'Desconectado')).toEqual({
      kind: 'bad',
      tone: 'error',
      label: 'Desconectado',
    });
    expect(flagFor(false, 'Sin restricciones', 'Restringida', 'warn').tone).toBe('warning');
    expect(flagFor(null, 'a', 'b').label).toBe('Sin dato');
    expect(flagFor(undefined, 'a', 'b').kind).toBe('unknown');
  });

  it('watchedPackageSet: expande @default_sms a la app de SMS del celular y une reglas y reporte', () => {
    const watched = watchedPackageSet(notifier({ watchRules: [{ packageNames: ['com.todo1.mobile'] }] }), {
      at: iso(10),
      report: { rules: { watched: ['com.davivienda.daviplata'] } },
    });
    expect([...watched].sort()).toEqual([
      'com.android.mms',
      'com.davivienda.daviplata',
      'com.nequi.mobileapp',
      'com.todo1.mobile',
    ]);
  });

  it('watchedPackageSet: sin app de SMS reportada, @default_sms no marca nada', () => {
    const watched = watchedPackageSet(
      notifier({
        pairedDevice: { deviceId: 'd1', defaultSmsPackage: null, pairedAt: iso(1000) },
      }),
      null,
    );
    expect([...watched]).toEqual(['com.nequi.mobileapp']);
    expect(watchedPackageSet(null, null).size).toBe(0);
  });

  it('seenByPackageEntries: lee el arreglo del backend y tolera el objeto antiguo; descarta basura', () => {
    expect(
      seenByPackageEntries([
        { packageName: 'co.yaestapago.notifier', count: 80 },
        { packageName: '', count: 3 },
        { packageName: 'com.android.mms', count: 'x' } as never,
        null as never,
        { packageName: 'com.nequi.mobileapp', count: 4 },
      ]),
    ).toEqual([
      { packageName: 'co.yaestapago.notifier', count: 80 },
      { packageName: 'com.nequi.mobileapp', count: 4 },
    ]);
    expect(seenByPackageEntries({ 'co.yaestapago.notifier': 80, 'com.android.mms': 12 })).toEqual([
      { packageName: 'co.yaestapago.notifier', count: 80 },
      { packageName: 'com.android.mms', count: 12 },
    ]);
    expect(seenByPackageEntries([])).toEqual([]);
    expect(seenByPackageEntries(null)).toEqual([]);
    expect(seenByPackageEntries(undefined)).toEqual([]);
  });

  it('topSeenApps: ordena por cuenta, marca vigiladas y la app de SMS, respeta el límite', () => {
    const rows = topSeenApps(
      [
        { packageName: 'com.android.mms', count: 12 },
        { packageName: 'co.yaestapago.notifier', count: 80 },
        { packageName: 'com.nequi.mobileapp', count: 4 },
        { packageName: 'x.y', count: 0 },
      ],
      new Set(['com.android.mms', 'com.nequi.mobileapp']),
      'com.android.mms',
      2,
    );
    expect(rows.map((row) => row.packageName)).toEqual(['co.yaestapago.notifier', 'com.android.mms']);
    expect(rows[0]).toMatchObject({ appLabel: 'YEP Notifyer', watched: false, isSms: false });
    expect(rows[1]).toMatchObject({ appLabel: 'Mensajes', watched: true, isSms: true, count: 12 });
    expect(topSeenApps(null, new Set(), null)).toEqual([]);
    expect(topSeenApps([], new Set(), null)).toEqual([]);
  });

  it('topSeenApps: también funciona con el objeto de un backend anterior', () => {
    const rows = topSeenApps({ 'com.nequi.mobileapp': 80, 'com.android.mms': 12 }, new Set(), null);
    expect(rows.map((row) => `${row.packageName}:${row.count}`)).toEqual([
      'com.nequi.mobileapp:80',
      'com.android.mms:12',
    ]);
  });

  describe('summarizeTimeline: 24 h en cubetas fijas de 15 min', () => {
    const now = NOW.getTime();
    const states = (summary: ReturnType<typeof summarizeTimeline>) =>
      summary.segments.map((segment) => segment.state);

    it('siempre devuelve 96 cubetas, de la más vieja a la más reciente, cubriendo hasta "ahora"', () => {
      const summary = summarizeTimeline(history([true]), now);
      expect(TIMELINE_BUCKETS).toBe(96);
      expect(summary.segments).toHaveLength(96);
      expect(summary.from).toBe(new Date(now - 24 * 60 * 60_000).toISOString());
      expect(summary.to).toBe(new Date(now).toISOString());
      expect(summary.segments[0].start).toBe(summary.from);
      expect(summary.segments[95].end).toBe(summary.to);
      // Latido hace 5 min → cubeta más reciente (la última); el resto sin datos.
      expect(summary.segments[95].state).toBe('on');
      expect(summary.segments[95].count).toBe(1);
      expect(states(summary).filter((state) => state === 'none')).toHaveLength(95);
    });

    it('una cubeta es "off" si cualquier latido dentro iba sin escuchar; "none" sin latidos', () => {
      // Hace 80, 60, 40 y 20 min → cubetas 5, 4, 2 y 1 (índices desde la más reciente).
      const summary = summarizeTimeline(history([true, true, false, true], 20), now);
      const byIndexFromNow = (index: number) => summary.segments[95 - index];
      expect(byIndexFromNow(5).state).toBe('on');
      expect(byIndexFromNow(4).state).toBe('on');
      expect(byIndexFromNow(3).state).toBe('none');
      expect(byIndexFromNow(2).state).toBe('off');
      expect(byIndexFromNow(1).state).toBe('on');
      expect(byIndexFromNow(0).state).toBe('none');
      expect(byIndexFromNow(2).title).toContain('Sin escuchar (1 latido)');
      expect(byIndexFromNow(0).title).toContain('Sin datos');

      // Dos latidos en la misma cubeta, uno sin escuchar ⇒ off.
      const mixed = summarizeTimeline(
        [
          { at: iso(3), captureActive: true },
          { at: iso(8), captureActive: false },
        ],
        now,
      );
      expect(mixed.segments[95].state).toBe('off');
      expect(mixed.segments[95].count).toBe(2);
      expect(mixed.segments[95].title).toContain('(2 latidos)');
    });

    it('porcentaje, cortes y cambios se calculan sobre los latidos, con su hora exacta', () => {
      const summary = summarizeTimeline(
        [
          ...history([true, true, false, false, true]).reverse(),
          { at: 'no-es-fecha', captureActive: true },
        ],
        now,
      );
      expect(summary.points).toBe(5);
      expect(summary.activePercent).toBe(60);
      expect(summary.outages).toBe(1);
      expect(summary.transitions).toEqual([
        { at: iso(5), active: true },
        { at: iso(15), active: false },
      ]);
    });

    it('descarta latidos fuera de la ventana (más de 24 h o en el futuro)', () => {
      const summary = summarizeTimeline(
        [
          { at: iso(25 * 60), captureActive: false },
          { at: iso(-10), captureActive: false },
          { at: iso(10), captureActive: true },
        ],
        now,
      );
      expect(summary.points).toBe(1);
      expect(summary.activePercent).toBe(100);
      expect(summary.outages).toBe(0);
      expect(states(summary).filter((state) => state === 'off')).toHaveLength(0);
    });

    it('sin historial: 96 cubetas vacías y cero latidos', () => {
      const summary = summarizeTimeline(undefined, now);
      expect(summary.segments).toHaveLength(96);
      expect(states(summary).every((state) => state === 'none')).toBe(true);
      expect(summary).toMatchObject({ points: 0, activePercent: 0, outages: 0, transitions: [] });
    });
  });

  it('selfTestReasonCopy: texto por causa; vacío si no viene o es desconocida', () => {
    expect(selfTestReasonCopy('not_posted')).toBe(SELF_TEST_REASON_COPY.not_posted);
    expect(selfTestReasonCopy('listener_missed')).toBe(SELF_TEST_REASON_COPY.listener_missed);
    expect(selfTestReasonCopy(null)).toBe('');
    expect(selfTestReasonCopy(undefined)).toBe('');
    expect(selfTestReasonCopy('otra_causa_futura')).toBe('');
  });

});

describe('NotifierDiagnosticsModal', () => {
  let api: { diagnostics: ReturnType<typeof vi.fn> };

  function render(
    value: Notifier,
    open = true,
  ): ComponentFixture<NotifierDiagnosticsModal> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: NotifiersApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(NotifierDiagnosticsModal);
    fixture.componentRef.setInput('notifier', value);
    fixture.componentRef.setInput('open', open);
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: ComponentFixture<NotifierDiagnosticsModal>) =>
    fixture.nativeElement as HTMLElement;
  const text = (fixture: ComponentFixture<NotifierDiagnosticsModal>) =>
    (el(fixture).textContent ?? '').replace(/\s+/g, ' ');
  /** Valor del `yep-description-item` cuya etiqueta es `label` (texto colapsado). */
  const dlValue = (fixture: ComponentFixture<NotifierDiagnosticsModal>, label: string) => {
    const item = Array.from(el(fixture).querySelectorAll('yep-description-item')).find(
      (candidate) =>
        candidate.querySelector('.yep-description-item__label')?.textContent?.trim() === label,
    );
    return (item?.querySelector('.yep-description-item__value')?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const response: NotifierDiagnosticsResponse = {
    capture: capture(),
    // Hace 80, 60, 40 y 20 min: cada latido cae en una cubeta distinta de 15 min.
    captureHistory: history([true, true, false, true], 20),
    reports: [
      {
        at: iso(50),
        appVersion: '1.0.8',
        report: {
          device: { manufacturer: 'Xiaomi', model: 'Redmi 12', osVersion: '14' },
          health: { listenerConnected: true, seenTotal: 90, selfTest: { ok: true } },
          rules: { rulesVersion: 'abcdef0123456789', watched: ['com.android.mms'], pairings: 1 },
          nearMisses: [{ at: iso(60), packageName: 'com.android.mms', reason: 'sender_not_matched' }],
          notes: 'Probando desde la caja',
        },
      },
      { at: iso(500), appVersion: '1.0.7' },
    ],
  };

  beforeEach(() => {
    // Solo el reloj: los "hace X" deben ser estables; el resto de timers siguen reales.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    api = { diagnostics: vi.fn().mockReturnValue(of(response)) };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('al abrirse pide el diagnóstico del notificador y lo pinta', () => {
    const fixture = render(notifier());
    expect(api.diagnostics).toHaveBeenCalledWith('n1');

    const content = text(fixture);
    expect(content).toContain('Diagnóstico de escucha');
    expect(content).toContain('Caja · Xiaomi Redmi 12 · app 1.0.8');
    expect(el(fixture).querySelector('[data-testid="diag-summary"]')?.textContent).toContain(
      'Escuchando',
    );

    const rows = Array.from(el(fixture).querySelectorAll('[data-testid="diag-status"] li'));
    expect(rows.map((row) => row.getAttribute('data-key'))).toEqual([
      'listener',
      'permission',
      'conversations',
      'smsHidden',
      'notifications',
      'service',
      'battery',
    ]);
    expect(rows[0].textContent).toContain('Conectado');
    expect(rows[0].textContent).toContain('desde hace 2 h');
    // App ≤ 1.0.8: aún no prueba las conversaciones.
    expect(rows[2].textContent).toContain('Sin probar');
    // App ≤ 1.0.10: no reporta los SMS ocultos.
    expect(rows[3].textContent).toContain('Sin datos');
    expect(rows[4].textContent).toContain('Permitidos');
    expect(rows[6].textContent).toContain('Sin restricciones');

    expect(dlValue(fixture, 'Notificaciones vistas desde el arranque')).toContain('96');
    // Sin `lastNotificationAt` no hay fecha, así que tampoco se muestra la app.
    expect(dlValue(fixture, 'Última notificación vista')).toBe('Ninguna todavía');
    expect(dlValue(fixture, 'Aceptadas (pagos)')).toBe('3');
    expect(content).toContain('Funcionó');
    expect(content).toContain('entregada en 230 ms');
  });

  it('"última notificación vista": hace X · fecha · app (del `capture.lastNotificationPackage`)', () => {
    const fixture = render(notifier({ lastNotificationAt: iso(3) }));
    const value = dlValue(fixture, 'Última notificación vista');
    expect(value).toContain('hace 3 min');
    expect(value).toContain('Nequi');
    expect(value).toContain('com.nequi.mobileapp');
  });

  it('"última notificación vista" sin app (no era una app vigilada): solo la hora', () => {
    const snapshot = capture({ lastNotificationPackage: null });
    api.diagnostics.mockReturnValue(of({ ...response, capture: snapshot }));
    const fixture = render(notifier({ lastNotificationAt: iso(3), capture: snapshot }));
    const value = dlValue(fixture, 'Última notificación vista');
    expect(value).toContain('hace 3 min');
    // "hace 3 min · fecha", sin el tercer tramo de la app.
    expect(value?.match(/·/g)).toHaveLength(1);
  });

  it('la sección se llama "Apps vigiladas" y dice que solo muestra las del banco y la de SMS', () => {
    const content = text(render(notifier()));
    expect(content).toContain('Apps vigiladas');
    expect(content).toContain('Solo las apps del banco y la de SMS. Sin texto: solo cuántas.');
    expect(content).not.toContain('Lo que ha visto el listener');
    expect(content).not.toContain('cualquier app');
  });

  describe('fila "Avisos de la app" (capture.notificationsEnabled)', () => {
    const notificationsRow = (fixture: ComponentFixture<NotifierDiagnosticsModal>) =>
      el(fixture).querySelector('[data-testid="diag-status"] li[data-key="notifications"]');

    function renderWith(notificationsEnabled: boolean | null | undefined) {
      const snapshot = capture();
      if (notificationsEnabled === undefined) {
        delete snapshot.notificationsEnabled;
      } else {
        snapshot.notificationsEnabled = notificationsEnabled;
      }
      api.diagnostics.mockReturnValue(of({ ...response, capture: snapshot }));
      return render(notifier());
    }

    it('true ⇒ "Permitidos" en verde', () => {
      const row = notificationsRow(renderWith(true));
      expect(row?.textContent).toContain('Permitidos');
      expect(row?.querySelector('.yep-status-chip--success')).not.toBeNull();
      expect(row?.textContent).not.toContain('Sin este permiso');
    });

    it('false ⇒ "Bloqueados" en ámbar con la consecuencia', () => {
      const row = notificationsRow(renderWith(false));
      expect(row?.textContent).toContain('Bloqueados');
      expect(row?.querySelector('.yep-status-chip--warning')).not.toBeNull();
      expect(row?.textContent).toContain('no puede hacer la prueba de escucha ni avisarte');
    });

    it('null ⇒ "Sin dato"', () => {
      expect(notificationsRow(renderWith(null))?.textContent).toContain('Sin dato');
    });

    it('ausente (backend viejo) ⇒ "Sin dato"', () => {
      expect(notificationsRow(renderWith(undefined))?.textContent).toContain('Sin dato');
    });
  });

  describe('fila "Conversaciones (SMS)" (capture.conversationsAllowed, app ≥ 1.0.9)', () => {
    const conversationsRow = (fixture: ComponentFixture<NotifierDiagnosticsModal>) =>
      el(fixture).querySelector('[data-testid="diag-status"] li[data-key="conversations"]');

    function renderWith(conversationsAllowed: boolean | null | undefined) {
      const snapshot = capture();
      if (conversationsAllowed === undefined) {
        delete snapshot.conversationsAllowed;
      } else {
        snapshot.conversationsAllowed = conversationsAllowed;
      }
      api.diagnostics.mockReturnValue(of({ ...response, capture: snapshot }));
      return render(notifier());
    }

    it('true ⇒ "Permitidas" en verde, sin detalle', () => {
      const row = conversationsRow(renderWith(true));
      expect(row?.textContent).toContain('Conversaciones (SMS)');
      expect(row?.textContent).toContain('Permitidas');
      expect(row?.querySelector('.yep-status-chip--success')).not.toBeNull();
      expect(row?.querySelector('.diag-flags__detail')).toBeNull();
    });

    it('false ⇒ "Bloqueadas" en ámbar con qué hacer en el celular', () => {
      const row = conversationsRow(renderWith(false));
      expect(row?.textContent).toContain('Bloqueadas');
      expect(row?.querySelector('.yep-status-chip--warning')).not.toBeNull();
      expect(row?.querySelector('.diag-flags__detail')?.textContent?.trim()).toBe(
        CONVERSATIONS_BLOCKED_DETAIL,
      );
      expect(CONVERSATIONS_BLOCKED_DETAIL).toBe(
        'Android no le entrega los SMS a YEP. En el celular: Ajustes → Acceso a notificaciones → YEP Notifyer → activa «Conversaciones».',
      );
    });

    it('null ⇒ "Sin probar" en gris', () => {
      const row = conversationsRow(renderWith(null));
      expect(row?.textContent).toContain('Sin probar');
      expect(row?.querySelector('.yep-status-chip--neutral')).not.toBeNull();
      expect(row?.textContent).not.toContain('Android no le entrega');
    });

    it('ausente (app o backend anterior) ⇒ "Sin probar"', () => {
      expect(conversationsRow(renderWith(undefined))?.textContent).toContain('Sin probar');
    });

    it('conversationsFlag: Permitidas / Bloqueadas (warn) / Sin probar', () => {
      expect(conversationsFlag(true)).toEqual({ kind: 'ok', tone: 'success', label: 'Permitidas' });
      expect(conversationsFlag(false)).toEqual({
        kind: 'warn',
        tone: 'warning',
        label: 'Bloqueadas',
      });
      expect(conversationsFlag(null)).toEqual({
        kind: 'unknown',
        tone: 'neutral',
        label: 'Sin probar',
      });
      expect(conversationsFlag(undefined).label).toBe('Sin probar');
    });
  });

  describe('fila "SMS del banco" (capture.smsHidden, app ≥ 1.0.11)', () => {
    const HOUR_MIN = 60;
    const smsRow = (fixture: ComponentFixture<NotifierDiagnosticsModal>) =>
      el(fixture).querySelector('[data-testid="diag-status"] li[data-key="smsHidden"]');

    function renderWith(smsHidden: NotifierCaptureSnapshot['smsHidden'] | undefined) {
      const snapshot = capture();
      if (smsHidden === undefined) {
        delete snapshot.smsHidden;
      } else {
        snapshot.smsHidden = smsHidden;
      }
      api.diagnostics.mockReturnValue(of({ ...response, capture: snapshot }));
      return render(notifier());
    }

    it('legible reciente ⇒ "Visibles" en verde, con hace cuánto', () => {
      const row = smsRow(
        renderWith({
          count: 0,
          lastHiddenAt: null,
          lastReadableAt: iso(3 * HOUR_MIN),
          packageName: null,
        }),
      );
      expect(row?.textContent).toContain('SMS del banco');
      expect(row?.textContent).toContain('Visibles');
      expect(row?.querySelector('.yep-status-chip--success')).not.toBeNull();
      expect(row?.querySelector('.diag-flags__detail')?.textContent?.trim()).toBe(
        'último hace 3 h',
      );
    });

    it('oculta en 72 h y ninguna legible ⇒ "Android los oculta" en ámbar, con la hora de Bogotá y qué hacer', () => {
      // NOW = 15:00 UTC; hace 2 h = 13:00 UTC = 08:00 en Bogotá.
      const row = smsRow(
        renderWith({
          count: 12,
          lastHiddenAt: iso(2 * HOUR_MIN),
          lastReadableAt: iso(80 * HOUR_MIN),
          packageName: 'com.google.android.apps.messaging',
        }),
      );
      expect(row?.textContent).toContain('Android los oculta');
      expect(row?.querySelector('.yep-status-chip--warning')).not.toBeNull();
      expect(row?.querySelector('.diag-flag__icon--warn')).not.toBeNull();
      const detail = row?.querySelector('.diag-flags__detail')?.textContent ?? '';
      expect(detail).toContain('Última oculta: 13 de oct');
      expect(detail).toContain('08:00');
      expect(detail).toContain(SMS_HIDDEN_INSTRUCTION);
      expect(SMS_HIDDEN_INSTRUCTION).toBe(
        'Guardar el remitente como contacto (p. ej. Bancolombia: 85540 y 85630) y abrir la conversación en Mensajes.',
      );
    });

    it('legible dentro de las 72 h ⇒ "Visibles" aunque haya una oculta', () => {
      const row = smsRow(
        renderWith({ lastHiddenAt: iso(HOUR_MIN), lastReadableAt: iso(5 * HOUR_MIN) }),
      );
      expect(row?.textContent).toContain('Visibles');
    });

    it('la reporta pero sin SMS del banco en 72 h ⇒ "Sin datos" con la aclaración', () => {
      const row = smsRow(
        renderWith({ count: 0, lastHiddenAt: null, lastReadableAt: iso(73 * HOUR_MIN) }),
      );
      expect(row?.textContent).toContain('Sin datos');
      expect(row?.querySelector('.yep-status-chip--neutral')).not.toBeNull();
      expect(row?.querySelector('.diag-flags__detail')?.textContent?.trim()).toBe(SMS_QUIET_DETAIL);
    });

    it('null o ausente (app ≤ 1.0.10) ⇒ "Sin datos" sin detalle', () => {
      for (const value of [null, undefined]) {
        const row = smsRow(renderWith(value));
        expect(row?.textContent).toContain('Sin datos');
        expect(row?.querySelector('.diag-flags__detail')).toBeNull();
      }
    });

    it('smsHiddenFlag y smsHiddenDetail', () => {
      expect(smsHiddenFlag('visible')).toEqual({ kind: 'ok', tone: 'success', label: 'Visibles' });
      expect(smsHiddenFlag('hidden')).toEqual({
        kind: 'warn',
        tone: 'warning',
        label: 'Android los oculta',
      });
      expect(smsHiddenFlag('quiet').label).toBe('Sin datos');
      expect(smsHiddenFlag('none')).toEqual({
        kind: 'unknown',
        tone: 'neutral',
        label: 'Sin datos',
      });
      // Sin hora legible, solo la indicación.
      expect(smsHiddenDetail({ lastHiddenAt: 'x' }, 'hidden')).toBe(SMS_HIDDEN_INSTRUCTION);
      expect(smsHiddenDetail(null, 'none')).toBe('');
    });
  });

  describe('prueba de escucha: parte "conversación" (capture.selfTest.conversationOk)', () => {
    const conversationEl = (fixture: ComponentFixture<NotifierDiagnosticsModal>) =>
      el(fixture).querySelector('[data-testid="diag-self-test-conversation"]');

    function renderSelfTest(selfTest: NotifierCaptureSnapshot['selfTest']) {
      api.diagnostics.mockReturnValue(of({ ...response, capture: capture({ selfTest }) }));
      return render(notifier());
    }

    it('false ⇒ explica que «Conversaciones» está apagado', () => {
      const fixture = renderSelfTest({
        at: iso(10),
        ok: true,
        latencyMs: 90,
        conversationOk: false,
      });
      expect(conversationEl(fixture)?.textContent?.trim()).toBe(
        'La notificación de tipo conversación no llegó: «Conversaciones» está apagado para YEP.',
      );
    });

    it('también cuando la prueba completa falló, junto a la causa', () => {
      const fixture = renderSelfTest({
        at: iso(10),
        ok: false,
        reason: 'listener_missed',
        conversationOk: false,
      });
      expect(el(fixture).querySelector('[data-testid="diag-self-test-reason"]')).not.toBeNull();
      expect(conversationEl(fixture)).not.toBeNull();
    });

    it('true, null o ausente ⇒ no muestra la línea', () => {
      for (const conversationOk of [true, null, undefined]) {
        const fixture = renderSelfTest({ at: iso(10), ok: true, latencyMs: 90, conversationOk });
        expect(conversationEl(fixture)).toBeNull();
      }
    });
  });

  describe('causa de una prueba de escucha fallida (capture.selfTest.reason)', () => {
    const reasonEl = (fixture: ComponentFixture<NotifierDiagnosticsModal>) =>
      el(fixture).querySelector('[data-testid="diag-self-test-reason"]');

    function renderSelfTest(selfTest: NotifierCaptureSnapshot['selfTest']) {
      api.diagnostics.mockReturnValue(of({ ...response, capture: capture({ selfTest }) }));
      return render(notifier());
    }

    it('not_posted ⇒ la app no pudo mostrar la notificación de prueba', () => {
      const fixture = renderSelfTest({ at: iso(10), ok: false, reason: 'not_posted' });
      expect(el(fixture).querySelector('[data-testid="diag-self-test"]')?.textContent).toContain(
        'Falló',
      );
      expect(reasonEl(fixture)?.textContent?.trim()).toBe(
        'La app no pudo mostrar la notificación de prueba (sin permiso de notificaciones).',
      );
    });

    it('listener_missed ⇒ el listener no la recibió', () => {
      const fixture = renderSelfTest({ at: iso(10), ok: false, reason: 'listener_missed' });
      expect(reasonEl(fixture)?.textContent?.trim()).toBe('El listener no la recibió.');
    });

    it('falló sin causa (app vieja) ⇒ solo el chip, sin explicación', () => {
      const fixture = renderSelfTest({ at: iso(10), ok: false });
      expect(el(fixture).querySelector('[data-testid="diag-self-test"]')?.textContent).toContain(
        'Falló',
      );
      expect(reasonEl(fixture)).toBeNull();
    });

    it('funcionó ⇒ nunca muestra causa aunque venga', () => {
      const fixture = renderSelfTest({
        at: iso(10),
        ok: true,
        latencyMs: 90,
        reason: 'listener_missed',
      });
      expect(reasonEl(fixture)).toBeNull();
    });
  });

  it('no abre la petición mientras el modal está cerrado', () => {
    render(notifier(), false);
    expect(api.diagnostics).not.toHaveBeenCalled();
  });

  it('marca las apps vigiladas con la app de SMS expandida y ordena por vistas', () => {
    const fixture = render(notifier());
    const rows = Array.from(
      el(fixture).querySelectorAll<HTMLTableRowElement>('[data-testid="diag-top-apps"] tbody tr'),
    );
    expect(rows.map((row) => row.getAttribute('data-package'))).toEqual([
      'com.android.mms',
      'com.nequi.mobileapp',
      'co.yaestapago.notifier',
    ]);
    expect(rows[0].textContent).toContain('App de SMS');
    expect(rows[0].textContent).toContain('Vigilada');
    expect(rows[1].textContent).toContain('Nequi');
    expect(rows[1].textContent).toContain('Vigilada');
    // La propia app (prueba de escucha) se ve, pero no es una app vigilada.
    expect(rows[2].textContent).toContain('YEP Notifyer');
    expect(rows[2].textContent).not.toContain('Vigilada');
  });

  it('pinta la línea de tiempo con 96 cubetas fijas y los cambios de estado', () => {
    const fixture = render(notifier());
    const segments = Array.from(
      el(fixture).querySelectorAll('[data-testid="diag-timeline"] .diag-timeline__seg'),
    );
    expect(segments).toHaveLength(96);
    const withClass = (name: string) =>
      segments.filter((segment) => segment.classList.contains(name)).length;
    expect(withClass('diag-timeline__seg--on')).toBe(3);
    expect(withClass('diag-timeline__seg--off')).toBe(1);
    expect(withClass('diag-timeline__seg--none')).toBe(92);
    // La cubeta "off" (hace 40 min) está tercera desde la derecha; la más reciente no tiene datos.
    expect(segments[93].classList.contains('diag-timeline__seg--off')).toBe(true);
    expect(segments[95].classList.contains('diag-timeline__seg--none')).toBe(true);
    expect(segments[93].getAttribute('title')).toContain('Sin escuchar');
    expect(el(fixture).querySelector('[data-testid="diag-timeline"]')?.getAttribute('aria-label')).toBe(
      'Escuchando el 75 % del tiempo, 1 cortes',
    );
    expect(text(fixture)).toContain('75 % escuchando · 1 corte · 4 latidos');
    const changes = Array.from(
      el(fixture).querySelectorAll('[data-testid="diag-transitions"] li'),
    ).map((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(changes).toHaveLength(2);
    expect(changes[0]).toContain('Volvió a escuchar');
    expect(changes[1]).toContain('Dejó de escuchar');
  });

  it('muestra el último reporte completo: versión, celular, reglas y notas', () => {
    const fixture = render(notifier());
    const report = el(fixture).querySelector('[data-testid="diag-report"]');
    expect(report?.textContent).toContain('1.0.8');
    expect(report?.textContent).toContain('Xiaomi · Redmi 12 · Android 14');
    expect(report?.textContent).toContain('abcdef01');
    expect(report?.textContent).toContain('Probando desde la caja');
    expect(text(fixture)).toContain('2 reportes guardados');
  });

  it('listener desconectado: chip "Sin escuchar", fila en rojo y aviso con qué hacer', () => {
    api.diagnostics.mockReturnValue(
      of({
        ...response,
        capture: capture({
          captureActive: false,
          listenerConnected: false,
          listenerDisconnectedAt: iso(15),
          rebindAttempts: 3,
          lastRebindAt: iso(4),
        }),
      }),
    );
    const fixture = render(notifier());
    const content = text(fixture);
    expect(el(fixture).querySelector('[data-testid="diag-summary"]')?.textContent).toContain(
      'Sin escuchar',
    );
    expect(content).toContain('Android desconectó el acceso a notificaciones de YEP');
    const listenerRow = el(fixture).querySelector('[data-testid="diag-status"] li[data-key="listener"]');
    expect(listenerRow?.textContent).toContain('Desconectado');
    expect(listenerRow?.textContent).toContain('desde hace 15 min');
    expect(content).toContain('Intentos de reconexión: 3');
  });

  it('si el GET falla, avisa y muestra lo que ya traía el notificador', () => {
    api.diagnostics.mockReturnValue(throwError(() => ({ status: 404, error: { message: 'Not Found' } })));
    const fixture = render(
      notifier({
        capture: capture({ seenTotal: 7, seenByPackage: null, receiver: null, selfTest: null }),
        captureHistory: history([true]),
        latestDiagnosticReport: {
          at: iso(90),
          appVersion: '1.0.8',
          summary: { listenerConnected: true, selfTestOk: false, seenTotal: 5 },
        },
      }),
    );
    const content = text(fixture);
    expect(content).toContain('No pudimos cargar el detalle');
    expect(dlValue(fixture, 'Notificaciones vistas desde el arranque')).toContain('7');
    expect(content).toContain('Las apps vigiladas no han mostrado notificaciones');
    expect(content).toContain('todavía no reporta los contadores del filtro');
    expect(el(fixture).querySelector('[data-testid="diag-self-test"]')?.textContent).toContain(
      'Sin prueba todavía',
    );
    const report = el(fixture).querySelector('[data-testid="diag-report"]');
    expect(report?.textContent).toContain('1.0.8');
    expect(report?.textContent).toContain('Falló');
  });

  it('sin foto, historial ni reporte: estado vacío que pide actualizar la app', () => {
    api.diagnostics.mockReturnValue(of({ capture: null, captureHistory: [], reports: [] }));
    const fixture = render(notifier());
    expect(text(fixture)).toContain('El celular aún no reporta diagnóstico');
    expect(el(fixture).querySelector('[data-testid="diag-status"]')).toBeNull();
  });

  describe('peticiones en vuelo', () => {
    function pending() {
      const a$ = new Subject<NotifierDiagnosticsResponse>();
      const b$ = new Subject<NotifierDiagnosticsResponse>();
      api.diagnostics.mockImplementation((id: string) => (id === 'A' ? a$ : b$));
      return { a$, b$ };
    }

    it('una respuesta tardía del notificador anterior no pisa la del vigente', () => {
      const { a$, b$ } = pending();
      // Abre A (red lenta), cierra, abre B.
      const fixture = render(notifier({ id: 'A' }));
      expect(api.diagnostics).toHaveBeenCalledWith('A');
      expect(a$.observed).toBe(true);

      fixture.componentRef.setInput('open', false);
      fixture.detectChanges();
      fixture.componentRef.setInput('notifier', notifier({ id: 'B', displayName: 'Bodega' }));
      fixture.componentRef.setInput('open', true);
      fixture.detectChanges();
      expect(api.diagnostics).toHaveBeenCalledWith('B');
      // Al cambiar de id la petición de A quedó cancelada.
      expect(a$.observed).toBe(false);
      expect(fixture.componentInstance.loading()).toBe(true);

      // A responde tarde: no debe tocar nada.
      a$.next({ capture: capture({ seenTotal: 111 }), captureHistory: [], reports: [] });
      a$.complete();
      fixture.detectChanges();
      expect(fixture.componentInstance.data()).toBeNull();
      expect(fixture.componentInstance.loading()).toBe(true);
      expect(text(fixture)).not.toContain('111');

      // Llega B: es la que manda.
      b$.next({ capture: capture({ seenTotal: 222 }), captureHistory: [], reports: [] });
      b$.complete();
      fixture.detectChanges();
      expect(fixture.componentInstance.loading()).toBe(false);
      expect(fixture.componentInstance.data()?.capture?.seenTotal).toBe(222);
      expect(dlValue(fixture, 'Notificaciones vistas desde el arranque')).toContain('222');
      expect(text(fixture)).toContain('Bodega');
    });

    it('cerrar el modal cancela la petición en vuelo y apaga la carga', () => {
      const { a$ } = pending();
      const fixture = render(notifier({ id: 'A' }));
      expect(a$.observed).toBe(true);
      expect(fixture.componentInstance.loading()).toBe(true);

      fixture.componentRef.setInput('open', false);
      fixture.detectChanges();
      expect(a$.observed).toBe(false);
      expect(fixture.componentInstance.loading()).toBe(false);

      // Una respuesta tardía tras cerrar tampoco deja rastro.
      a$.next({ capture: capture({ seenTotal: 111 }), captureHistory: [], reports: [] });
      fixture.detectChanges();
      expect(fixture.componentInstance.data()).toBeNull();
    });
  });

  it('"Actualizar" vuelve a pedir el diagnóstico; "Cerrar" avisa al padre', () => {
    const fixture = render(notifier());
    let closed = 0;
    fixture.componentInstance.closeRequested.subscribe(() => (closed += 1));
    fixture.componentInstance.reload();
    expect(api.diagnostics).toHaveBeenCalledTimes(2);
    fixture.componentInstance.close();
    expect(closed).toBe(1);
  });
});
