import {
  MISSING_PAYMENT_CURSOR,
  MISSING_PAYMENT_QUESTION,
  notifierStatusQuestion,
  paymentQuestion,
} from './assistant-questions';

describe('Preguntas para abrir a Zaira', () => {
  it('"Falta un pago": el cursor queda donde va el monto', () => {
    expect(MISSING_PAYMENT_QUESTION).toBe('Me hicieron un pago de $  a las  y no aparece');
    expect(MISSING_PAYMENT_QUESTION.slice(0, MISSING_PAYMENT_CURSOR)).toBe(
      'Me hicieron un pago de $ ',
    );
    expect(MISSING_PAYMENT_QUESTION.slice(MISSING_PAYMENT_CURSOR)).toBe(' a las  y no aparece');
  });

  it('un pago por revisar pregunta por qué quedó así, con el monto en formato colombiano', () => {
    expect(paymentQuestion('needs_review', 48000)).toEqual({
      label: '¿Por qué quedó por revisar?',
      question: '¿Por qué quedó por revisar este pago de $ 48.000?',
    });
  });

  it('un pago que quedó bien pregunta por el WhatsApp', () => {
    for (const status of ['processed', 'received', 'processing'] as const) {
      expect(paymentQuestion(status, 1250000)).toEqual({
        label: '¿Por qué no me llegó el WhatsApp?',
        question: '¿Por qué no me llegó el WhatsApp de este pago de $ 1.250.000?',
      });
    }
  });

  it('dice el estado que la persona ve: ignorado o fallido no son "por revisar"', () => {
    expect(paymentQuestion('ignored', 48000).question).toBe(
      '¿Por qué quedó ignorado este aviso de $ 48.000?',
    );
    expect(paymentQuestion('failed', 48000).question).toBe(
      '¿Por qué falló este aviso de $ 48.000?',
    );
  });

  it('sin monto no deja un "$" suelto', () => {
    expect(paymentQuestion('needs_review', null).question).toBe(
      '¿Por qué quedó por revisar este pago?',
    );
    expect(paymentQuestion('processed', 0).question).toBe(
      '¿Por qué no me llegó el WhatsApp de este pago?',
    );
  });

  it('el notificador se pregunta por el texto del chip, sin su nombre', () => {
    expect(notifierStatusQuestion('Fuera de línea')).toBe(
      '¿Por qué este notificador dice "Fuera de línea"?',
    );
  });
});
