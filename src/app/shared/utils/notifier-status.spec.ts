import {
  DEFAULT_NOTIFIER_STATUS_THRESHOLDS,
  computeNotifierStatus,
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
  });

  it('returns "online" within the delayed window', () => {
    const status = computeNotifierStatus(notifierSeenAgo(60_000), thresholds, now);
    expect(status.level).toBe('online');
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
