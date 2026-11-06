import type { SourceEventStatus } from '../../shared/models/source-event.models';

/**
 * Preguntas listas para abrir a Zaira desde otras pantallas. Aquí no entra texto de terceros
 * (nombre del pagador, nombre del notificador): en `message` tendría autoridad de usuario. Lo
 * que identifica el pago o el notificador va en `focus`, y lo valida el backend.
 */

export interface AssistantQuestion {
  /** Lo que dice el botón. */
  label: string;
  /** Lo que se le pregunta a Zaira. */
  question: string;
}

const COP = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

const MISSING_PAYMENT_START = 'Me hicieron un pago de $ ';

/**
 * El pago que no llegó no tiene fila: la pregunta queda en el cuadro para que la persona ponga
 * el monto y la hora, los dos datos con los que Zaira lo puede buscar.
 */
export const MISSING_PAYMENT_QUESTION = `${MISSING_PAYMENT_START} a las  y no aparece`;
/** Justo después de "$ ", donde va el monto. */
export const MISSING_PAYMENT_CURSOR = MISSING_PAYMENT_START.length;

/**
 * Desde el detalle de un pago. Si hay fila, el pago llegó: la duda real es por qué quedó en ese
 * estado o, si quedó bien, por qué no llegó el aviso.
 */
export function paymentQuestion(
  status: SourceEventStatus | null | undefined,
  amount: number | null | undefined,
): AssistantQuestion {
  const value = amount ? ` de $ ${COP.format(amount)}` : '';
  switch (status) {
    case 'needs_review':
      return {
        label: '¿Por qué quedó por revisar?',
        question: `¿Por qué quedó por revisar este pago${value}?`,
      };
    case 'ignored':
      return {
        label: '¿Por qué quedó ignorado?',
        question: `¿Por qué quedó ignorado este aviso${value}?`,
      };
    case 'failed':
      return { label: '¿Por qué falló?', question: `¿Por qué falló este aviso${value}?` };
    default:
      return {
        label: '¿Por qué no me llegó el WhatsApp?',
        question: `¿Por qué no me llegó el WhatsApp de este pago${value}?`,
      };
  }
}

/** Desde la tarjeta de un notificador. `statusLabel` es el texto del chip, que lo pone la web. */
export function notifierStatusQuestion(statusLabel: string): string {
  return `¿Por qué este notificador dice "${statusLabel}"?`;
}
