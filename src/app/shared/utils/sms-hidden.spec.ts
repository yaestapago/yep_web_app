import {
  SMS_HIDDEN_WINDOW_MS,
  formatBogotaDateTime,
  isSmsHiddenActive,
  smsHiddenState,
} from './sms-hidden';

describe('SMS del banco ocultos por Android (regla de 72 h, igual que el backend)', () => {
  const now = new Date('2026-10-17T21:00:00.000Z').getTime();
  const HOUR = 60 * 60 * 1000;
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('la ventana es de 72 h', () => {
    expect(SMS_HIDDEN_WINDOW_MS).toBe(72 * HOUR);
  });

  it('sin smsHidden (app < 1.0.11) no hay ocultos y el estado es "none"', () => {
    expect(isSmsHiddenActive(null, now)).toBe(false);
    expect(isSmsHiddenActive(undefined, now)).toBe(false);
    expect(smsHiddenState(null, now)).toBe('none');
    expect(smsHiddenState(undefined, now)).toBe('none');
  });

  it('lastHiddenAt en el borde: exactamente 72 h cuenta, 72 h + 1 ms ya no', () => {
    expect(isSmsHiddenActive({ lastHiddenAt: ago(HOUR) }, now)).toBe(true);
    expect(isSmsHiddenActive({ lastHiddenAt: ago(SMS_HIDDEN_WINDOW_MS) }, now)).toBe(true);
    expect(isSmsHiddenActive({ lastHiddenAt: ago(SMS_HIDDEN_WINDOW_MS + 1) }, now)).toBe(false);
    expect(isSmsHiddenActive({ lastHiddenAt: null }, now)).toBe(false);
  });

  it('lastReadableAt: null o anterior a hace 72 h → ocultos; reciente (más nueva o más vieja que la oculta) → no', () => {
    const hidden = ago(HOUR);
    expect(isSmsHiddenActive({ lastHiddenAt: hidden, lastReadableAt: null }, now)).toBe(true);
    expect(
      isSmsHiddenActive(
        { lastHiddenAt: hidden, lastReadableAt: ago(SMS_HIDDEN_WINDOW_MS + 1) },
        now,
      ),
    ).toBe(true);
    expect(
      isSmsHiddenActive({ lastHiddenAt: hidden, lastReadableAt: ago(SMS_HIDDEN_WINDOW_MS) }, now),
    ).toBe(false);
    expect(isSmsHiddenActive({ lastHiddenAt: hidden, lastReadableAt: ago(2 * HOUR) }, now)).toBe(
      false,
    );
    expect(isSmsHiddenActive({ lastHiddenAt: ago(2 * HOUR), lastReadableAt: hidden }, now)).toBe(
      false,
    );
  });

  it('una fecha ilegible cuenta como ausente', () => {
    expect(isSmsHiddenActive({ lastHiddenAt: 'ayer' }, now)).toBe(false);
    expect(isSmsHiddenActive({ lastHiddenAt: ago(HOUR), lastReadableAt: 'ayer' }, now)).toBe(true);
  });

  it('smsHiddenState: hidden / visible / quiet', () => {
    expect(smsHiddenState({ lastHiddenAt: ago(HOUR), lastReadableAt: null }, now)).toBe('hidden');
    expect(smsHiddenState({ lastHiddenAt: ago(HOUR), lastReadableAt: ago(2 * HOUR) }, now)).toBe(
      'visible',
    );
    expect(smsHiddenState({ lastHiddenAt: null, lastReadableAt: ago(HOUR) }, now)).toBe('visible');
    // La app lo reporta, pero no hubo SMS del banco en las últimas 72 h.
    expect(smsHiddenState({ lastHiddenAt: null, lastReadableAt: null }, now)).toBe('quiet');
    expect(
      smsHiddenState(
        {
          lastHiddenAt: ago(SMS_HIDDEN_WINDOW_MS + HOUR),
          lastReadableAt: ago(SMS_HIDDEN_WINDOW_MS + 2 * HOUR),
        },
        now,
      ),
    ).toBe('quiet');
  });

  it('sin `now` usa la hora actual', () => {
    expect(isSmsHiddenActive({ lastHiddenAt: new Date().toISOString() })).toBe(true);
  });

  it('formatBogotaDateTime: hora de Bogotá (UTC−5) en 24 h; vacío sin fecha válida', () => {
    // 20:10 UTC = 15:10 en Bogotá.
    const label = formatBogotaDateTime('2026-10-17T20:10:00.000Z');
    expect(label).toContain('17');
    expect(label).toContain('oct');
    expect(label).toContain('15:10');
    // 03:30 UTC del 18 = 22:30 del 17 en Bogotá.
    const late = formatBogotaDateTime('2026-10-18T03:30:00.000Z');
    expect(late).toContain('17');
    expect(late).toContain('22:30');
    expect(formatBogotaDateTime(null)).toBe('');
    expect(formatBogotaDateTime('ayer')).toBe('');
  });
});
