import { HttpErrorResponse } from '@angular/common/http';

import {
  blockerMessage,
  copilotErrorMessage,
  expectedToInput,
  formatExpectedDate,
  formatFieldValue,
  isPdfMime,
  linesToList,
  parseCopAmountInput,
  parseExpectedDate,
  templateStatusChips,
} from './receipt-bank.util';

describe('parseCopAmountInput', () => {
  it.each([
    ['$ 48.000', 48000],
    ['50.000', 50000],
    ['48000', 48000],
    ['1.250.300', 1250300],
    ['50,000', 50000],
    ['50.000,50', 50000.5],
    ['COP 48.000', 48000],
  ])('lee %s como %d', (raw, expected) => {
    expect(parseCopAmountInput(raw)).toBe(expected);
  });

  it.each(['48.00', '48,5', '1.000.50', 'mil', '', '0', '-5'])(
    'no adivina lo ambiguo: %s',
    (raw) => {
      expect(parseCopAmountInput(raw)).toBeNull();
    },
  );

  it('no repite el error de expected-values-form: "50.000" nunca es 50', () => {
    expect(parseCopAmountInput('50.000')).not.toBe(50);
  });
});

describe('parseExpectedDate', () => {
  it.each([
    ['05/07/2026 3:45 pm', '2026-07-05T15:45'],
    ['05/07/2026 3:45 PM', '2026-07-05T15:45'],
    ['05/07/2026 12:10 am', '2026-07-05T00:10'],
    ['05/07/2026 12:10 pm', '2026-07-05T12:10'],
    ['05/07/2026 14:30', '2026-07-05T14:30'],
    ['05/07/2026', '2026-07-05'],
    ['2026-11-05T14:30', '2026-11-05T14:30'],
    ['2026-11-05', '2026-11-05'],
  ])('lee %s', (raw, expected) => {
    expect(parseExpectedDate(raw)).toBe(expected);
  });

  it.each(['31/02/2026', '05/07/2026 25:00', '05/07/2026 13:00 pm', 'ayer', '2026-13-01'])(
    'rechaza %s',
    (raw) => {
      expect(parseExpectedDate(raw)).toBeNull();
    },
  );

  it('el primer número es el día: 05/07 es 5 de julio', () => {
    expect(parseExpectedDate('05/07/2026')).toBe('2026-07-05');
  });

  it('muestra lo guardado como se escribe', () => {
    expect(formatExpectedDate('2026-07-05T15:45')).toBe('05/07/2026 3:45 pm');
    expect(formatExpectedDate('2026-07-05T00:10')).toBe('05/07/2026 12:10 am');
    expect(formatExpectedDate('2026-07-05')).toBe('05/07/2026');
  });
});

describe('formato de valores', () => {
  it('muestra los montos como $ 48.000', () => {
    expect(formatFieldValue('amount', 48000)).toBe('$ 48.000');
    expect(formatFieldValue('amount', null)).toBe('—');
  });

  it('al editar un monto con centavos no lo redondea', () => {
    expect(expectedToInput('amount', { amount: 50000.5 })).toBe('$ 50.000,5');
    expect(parseCopAmountInput(expectedToInput('amount', { amount: 50000.5 }))).toBe(50000.5);
  });

  it('lo guardado se vuelve a leer igual', () => {
    expect(parseCopAmountInput(expectedToInput('amount', { amount: 48000 }))).toBe(48000);
    expect(parseExpectedDate(expectedToInput('dateTime', { dateTime: '2026-07-05T15:45' }))).toBe(
      '2026-07-05T15:45',
    );
  });
});

describe('blockerMessage', () => {
  it.each(['collisions', 're2_unavailable', 'too_few_examples', 'weak_detection'])(
    'explica %s con palabras, sin el código',
    (blocker) => {
      const message = blockerMessage(blocker);
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toContain(blocker);
    },
  );

  it('re2_unavailable dice que no se arregla desde aquí', () => {
    expect(blockerMessage('re2_unavailable')).toContain('equipo técnico');
  });

  it('un motivo que no conoce también da un texto claro', () => {
    expect(blockerMessage('nuevo_motivo')).toContain('impide aprobar');
  });
});

describe('otros apoyos', () => {
  it('reconoce un PDF por su tipo', () => {
    expect(isPdfMime('application/pdf')).toBe(true);
    expect(isPdfMime('APPLICATION/PDF ')).toBe(true);
    expect(isPdfMime('image/png')).toBe(false);
    expect(isPdfMime(null)).toBe(false);
  });

  it('una línea por valor, sin vacíos ni repetidos', () => {
    expect(linesToList(' uno \n\ndos\nuno\n')).toEqual(['uno', 'dos']);
  });

  it('una plantilla aprobada con cambios muestra los dos chips', () => {
    expect(templateStatusChips('approved', true).map((chip) => chip.label)).toEqual([
      'Aprobada',
      'Cambios sin aprobar',
    ]);
    expect(templateStatusChips('draft', false).map((chip) => chip.label)).toEqual(['Borrador']);
    expect(templateStatusChips('disabled', false)[0].tone).toBe('warning');
  });

  it('el 503 de la IA dice que falta configurarla', () => {
    const error = new HttpErrorResponse({ status: 503, error: { message: 'OPENAI_API_KEY' } });
    expect(copilotErrorMessage(error)).toContain('no está configurada');
    expect(copilotErrorMessage(error)).not.toContain('OPENAI');
  });

  it('el error de un trabajo pasa tal cual', () => {
    expect(copilotErrorMessage(new Error('Texto del trabajo'))).toBe('Texto del trabajo');
  });
});
