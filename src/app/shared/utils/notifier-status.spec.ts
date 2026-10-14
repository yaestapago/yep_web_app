import {
  DEFAULT_NOTIFIER_STATUS_THRESHOLDS,
  LISTENING_LABEL,
  NOT_LISTENING_LABEL,
  NOT_LISTENING_NO_ACCESS_LABEL,
  computeNotifierStatus,
  effectiveThresholds,
  relativeFromMs,
} from './notifier-status';

describe('computeNotifierStatus', () => {
  const now = new Date('2026-06-10T12:00:00.000Z').getTime();
  const thresholds = DEFAULT_NOTIFIER_STATUS_THRESHOLDS;

  function notifierSeenAgo(ms: number) {
    return { active: true, lastSeenAt: new Date(now - ms).toISOString() };
  }

  it('returns "unknown" when the notifier never reported', () => {
    const status = computeNotifierStatus({ active: true, lastSeenAt: undefined }, thresholds, now);
    expect(status.level).toBe('unknown');
    expect(status.sinceMs).toBeNull();
    expect(status.listening).toBeNull();
  });

  it('returns "online" within the delayed window', () => {
    const status = computeNotifierStatus(notifierSeenAgo(60_000), thresholds, now);
    expect(status.level).toBe('online');
    // App vieja: no se sabe si captura, se conserva la etiqueta de siempre.
    expect(status.listening).toBeNull();
    expect(status.label).toBe('En línea');
  });

  it('returns "delayed" past the delayed threshold but before offline', () => {
    const status = computeNotifierStatus(
      notifierSeenAgo(thresholds.delayedAfterMs + 1),
      thresholds,
      now,
    );
    expect(status.level).toBe('delayed');
  });

  it('returns "offline" past the offline threshold', () => {
    const status = computeNotifierStatus(
      notifierSeenAgo(thresholds.offlineAfterMs + 1),
      thresholds,
      now,
    );
    expect(status.level).toBe('offline');
  });

  it('returns "unknown" for an unparseable timestamp', () => {
    const status = computeNotifierStatus({ active: true, lastSeenAt: 'not-a-date' }, thresholds, now);
    expect(status.level).toBe('unknown');
  });

  describe('escucha real (app ≥ 1.0.6)', () => {
    it('verde solo cuando late Y captura', () => {
      const status = computeNotifierStatus(
        {
          ...notifierSeenAgo(60_000),
          lastCaptureAliveAt: new Date(now - 90_000).toISOString(),
        },
        thresholds,
        now,
      );
      expect(status.level).toBe('online');
      expect(status.listening).toBe(true);
      expect(status.label).toBe(LISTENING_LABEL);
    });

    it('late por WorkManager pero la captura murió ⇒ amarillo "sin escuchar"', () => {
      const status = computeNotifierStatus(
        {
          ...notifierSeenAgo(60_000),
          lastCaptureAliveAt: new Date(now - 40 * 60_000).toISOString(),
        },
        thresholds,
        now,
      );
      expect(status.level).toBe('delayed');
      expect(status.listening).toBe(false);
      expect(status.label).toBe(NOT_LISTENING_LABEL);
      // El "hace X" sigue siendo el del heartbeat.
      expect(status.sinceMs).toBe(60_000);
    });

    it('fuera de línea manda sobre la escucha', () => {
      const status = computeNotifierStatus(
        {
          ...notifierSeenAgo(thresholds.offlineAfterMs + 1),
          lastCaptureAliveAt: new Date(now - 60_000).toISOString(),
        },
        thresholds,
        now,
      );
      expect(status.level).toBe('offline');
      expect(status.label).toBe('Fuera de línea');
    });

    it('null explícito (backend nuevo, app vieja) = no se sabe', () => {
      const status = computeNotifierStatus(
        { ...notifierSeenAgo(60_000), lastCaptureAliveAt: null },
        thresholds,
        now,
      );
      expect(status.listening).toBeNull();
      expect(status.level).toBe('online');
    });
  });

  describe('acceso a notificaciones (app ≥ 1.0.8, `capture.listenerConnected`)', () => {
    /** Late hace 1 min, pero la captura lleva 40 min muerta. */
    function notListening() {
      return {
        ...notifierSeenAgo(60_000),
        lastCaptureAliveAt: new Date(now - 40 * 60_000).toISOString(),
      };
    }

    it('en línea, sin escuchar y Android soltó el listener ⇒ "sin acceso a notificaciones"', () => {
      const status = computeNotifierStatus(
        { ...notListening(), capture: { listenerConnected: false, serviceRunning: true } },
        thresholds,
        now,
      );
      expect(status.level).toBe('delayed');
      expect(status.listening).toBe(false);
      expect(status.label).toBe(NOT_LISTENING_NO_ACCESS_LABEL);
    });

    it('sin escuchar pero el listener seguía enlazado ⇒ etiqueta genérica (es el servicio)', () => {
      const status = computeNotifierStatus(
        { ...notListening(), capture: { listenerConnected: true, serviceRunning: false } },
        thresholds,
        now,
      );
      expect(status.level).toBe('delayed');
      expect(status.label).toBe(NOT_LISTENING_LABEL);
    });

    it('sin foto de captura (app vieja) o sin el dato ⇒ etiqueta genérica', () => {
      expect(computeNotifierStatus({ ...notListening(), capture: null }, thresholds, now).label).toBe(
        NOT_LISTENING_LABEL,
      );
      expect(computeNotifierStatus({ ...notListening(), capture: {} }, thresholds, now).label).toBe(
        NOT_LISTENING_LABEL,
      );
      expect(computeNotifierStatus(notListening(), thresholds, now).label).toBe(
        NOT_LISTENING_LABEL,
      );
    });

    it('solo aplica cuando no escucha: si captura, sigue "Escuchando" aunque la foto diga lo contrario', () => {
      const status = computeNotifierStatus(
        {
          ...notifierSeenAgo(60_000),
          lastCaptureAliveAt: new Date(now - 30_000).toISOString(),
          capture: { listenerConnected: false },
        },
        thresholds,
        now,
      );
      expect(status.level).toBe('online');
      expect(status.label).toBe(LISTENING_LABEL);
    });

    it('fuera de línea manda sobre el acceso', () => {
      const status = computeNotifierStatus(
        {
          ...notifierSeenAgo(thresholds.offlineAfterMs + 1),
          lastCaptureAliveAt: new Date(now - 40 * 60_000).toISOString(),
          capture: { listenerConnected: false },
        },
        thresholds,
        now,
      );
      expect(status.level).toBe('offline');
      expect(status.label).toBe('Fuera de línea');
    });
  });

  describe('cadencias propias', () => {
    it('un heartbeat espaciado no pinta amarillo entre latidos sanos', () => {
      const notifier = {
        ...notifierSeenAgo(10 * 60_000),
        runtimeConfig: {
          heartbeatIntervalSeconds: 600,
          flushIntervalSeconds: 30,
          workManagerFallbackMinutes: 15,
          onlineWindowSeconds: 1500,
          featureFlags: {},
          configVersion: 'x',
        },
      };
      expect(computeNotifierStatus(notifier, thresholds, now).level).toBe('online');
      const eff = effectiveThresholds(notifier, thresholds);
      expect(eff.delayedAfterMs).toBe(1500 * 1000);
      expect(eff.offlineAfterMs).toBe(4500 * 1000);
      expect(eff.refreshIntervalMs).toBe(thresholds.refreshIntervalMs);
    });

    it('una ventana menor que la de flota no endurece los umbrales', () => {
      const notifier = {
        ...notifierSeenAgo(60_000),
        runtimeConfig: {
          heartbeatIntervalSeconds: 60,
          flushIntervalSeconds: 30,
          workManagerFallbackMinutes: 15,
          onlineWindowSeconds: 30,
          featureFlags: {},
          configVersion: 'x',
        },
      };
      expect(effectiveThresholds(notifier, thresholds)).toEqual(thresholds);
    });
  });
});

describe('relativeFromMs', () => {
  it('reports "nunca" when there is no data', () => {
    expect(relativeFromMs(null)).toBe('nunca');
  });

  it('formats minutes and hours', () => {
    expect(relativeFromMs(3 * 60_000)).toBe('hace 3 min');
    expect(relativeFromMs(2 * 3_600_000)).toBe('hace 2 h');
  });
});
