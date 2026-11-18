import type { SourceEvent } from '../../../shared/models/source-event.models';

export const LINK_PENDING_TIMEOUT_MS = 20_000;

/** Espera el anuncio final y entrega solo el primer reporte de cada pago. */
export class PaymentReportTracker {
  private readonly seen = new Set<string>();
  private readonly pending = new Map<
    string,
    { event: SourceEvent; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(private readonly onFirstReport: (event: SourceEvent) => void) {}

  receive(event: SourceEvent): void {
    const held = this.pending.get(event.id);
    if (typeof event.firstReport !== 'boolean' && (event.linkPending === true || held)) {
      // Conserva la última versión del evento sin extender el tiempo de espera.
      const timer =
        held?.timer ??
        setTimeout(() => {
          const latest = this.pending.get(event.id)?.event ?? event;
          this.pending.delete(event.id);
          this.announce(latest);
        }, LINK_PENDING_TIMEOUT_MS);
      this.pending.set(event.id, { event, timer });
      return;
    }
    if (held) {
      clearTimeout(held.timer);
      this.pending.delete(event.id);
    }
    this.announce(event);
  }

  clear(): void {
    this.pending.forEach(({ timer }) => clearTimeout(timer));
    this.pending.clear();
    this.seen.clear();
  }

  private announce(event: SourceEvent): void {
    const transactionId = event.linkedTransactionId;
    const eventSeen = this.seen.has(event.id);
    const transactionSeen = !!transactionId && this.seen.has(transactionId);
    // Una reemisión puede traer por primera vez el enlace a la transacción.
    this.seen.add(event.id);
    if (transactionId) {
      this.seen.add(transactionId);
    }

    // El primer reporte puede llegar después de una corroboración que ya marcó la transacción.
    if (event.firstReport !== false && !eventSeen && (event.firstReport || !transactionSeen)) {
      this.onFirstReport(event);
    }
  }
}
