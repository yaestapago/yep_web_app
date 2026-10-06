import type { SourceEvent } from '../models/source-event.models';

/**
 * Clave del pago real al que pertenece un evento: la transacción enlazada, o el
 * propio evento (grupo de 1) mientras siga suelto. La tabla de eventos agrupa
 * con esta clave y la sección la usa para detectar corroboraciones en vivo:
 * ambas deben agrupar igual o la fila y su resaltado no coincidirían.
 */
export function sourceEventGroupKey(event: SourceEvent): string {
  return event.linkedTransactionId ?? `event:${event.id}`;
}

/**
 * Quién reportó el evento: el notificador (cada celular, escritorio o buzón
 * cuenta aparte) o, si el evento no trae notificador, el tipo de origen.
 */
export function sourceEventReporterKey(event: SourceEvent): string {
  return event.notifierId ?? `type:${event.sourceType}`;
}

/** Qué cambia en la lista cuando entra un evento en vivo. */
export interface LiveSourceEventChange {
  /** El id no estaba en la lista: es un reporte nuevo, no la reemisión de uno ya listado. */
  isNewReport: boolean;
  /**
   * El reporte se suma ahora a una fila (pago) que ya estaba en la lista: otro
   * evento ya tenía esa misma transacción enlazada.
   */
  corroborates: boolean;
}

/**
 * Clasifica un evento en vivo contra la lista ANTES de insertarlo. Una
 * reemisión que ya estaba enlazada a esa misma transacción no cuenta como
 * corroboración (no aporta una fuente nueva a la fila); sí cuenta la reemisión
 * que se enlaza por primera vez a un pago que ya tenía fila (las dos filas se
 * funden en una).
 */
export function classifyLiveSourceEvent(
  list: readonly SourceEvent[],
  event: SourceEvent,
): LiveSourceEventChange {
  const previous = list.find((current) => current.id === event.id);
  const transactionId = event.linkedTransactionId;
  const corroborates =
    !!transactionId &&
    previous?.linkedTransactionId !== transactionId &&
    list.some(
      (current) => current.id !== event.id && current.linkedTransactionId === transactionId,
    );
  return { isNewReport: !previous, corroborates };
}
