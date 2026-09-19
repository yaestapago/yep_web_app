import { CurrencyPipe, DatePipe, JsonPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideChevronDown,
  LucideChevronUp,
  LucideMail,
  LucideMonitor,
  LucideSmartphone,
} from '@lucide/angular';
import { catchError, finalize, forkJoin, of } from 'rxjs';

import type {
  SourceEvent,
  SourceEventStatus,
  SourceEventType,
} from '../../../../shared/models/source-event.models';
import type { PaymentTransaction } from '../../../../shared/models/transaction.models';
import { Button } from '../../../../shared/ui/button/button';
import { Modal } from '../../../../shared/ui/modal/modal';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import {
  isTransactionInvoiceable,
  isTransactionVerifiable,
  transactionStatusLabel,
  transactionTone,
  type TransactionTone,
} from '../../../../shared/utils/transaction-status';
import { SourceEventsApiService } from '../../../source-events/services/source-events-api.service';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';
import { TransactionSupportsPanel } from './transaction-supports-panel';

const MONEY_REPORT_SOURCE_TYPES: SourceEventType[] = ['NOTIFIER_APP', 'EMAIL_GMAIL'];
const MONEY_REPORT_STATUSES: SourceEventStatus[] = [
  'received',
  'processing',
  'processed',
  'failed',
];
const BOGOTA_TIME_ZONE = 'America/Bogota';

/**
 * Zona 3 (dashboard-events) ahora agrupa por `linkedTransactionId`: al abrir
 * este modal desde una fila agrupada, el evento que llegó puede ser
 * cualquiera de los "hermanos" (correo, app, sms…) que confirman el mismo
 * pago. Este modal muestra TODOS los reportes de esa operación en la misma
 * pantalla — cada uno expandible con sus propios datos — en vez de
 * reemplazar la vista al navegar a un evento relacionado (lo que antes
 * cambiaba la parte superior del modal de forma confusa).
 */
@Component({
  selector: 'app-source-event-detail-modal',
  imports: [
    CurrencyPipe,
    DatePipe,
    JsonPipe,
    Button,
    Modal,
    TransactionSupportsPanel,
    LucideChevronDown,
    LucideChevronUp,
    LucideMail,
    LucideMonitor,
    LucideSmartphone,
  ],
  templateUrl: './source-event-detail-modal.html',
  styleUrl: './source-event-detail-modal.scss',
})
export class SourceEventDetailModal {
  private readonly sourceEventsApi = inject(SourceEventsApiService);
  private readonly transactionsApi = inject(TransactionsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly event = input<SourceEvent | null>(null);
  readonly showPayload = input(false);
  readonly close = output<void>();
  /** Pide a la sección padre abrir el modal de verificación manual. */
  readonly verifyRequested = output<PaymentTransaction>();
  /** Pide a la sección padre abrir el modal de "aplicar a factura". */
  readonly invoiceRequested = output<PaymentTransaction>();

  readonly open = computed(() => this.event() !== null);
  /** El evento sobre el que se abrió el modal (el que el usuario clickeó). */
  readonly detail = signal<SourceEvent | null>(null);
  readonly transaction = signal<PaymentTransaction | null>(null);
  /** Otros source_events con la misma referencia, SIN transacción enlazada
   *  todavía — pista débil (texto), no confirmada; se muestra aparte de los
   *  reportes confirmados. */
  private readonly referenceMatches = signal<SourceEvent[]>([]);
  /** Reportes hermanos ya enlazados a la MISMA transacción que `detail()`. */
  private readonly siblingEvents = signal<SourceEvent[]>([]);
  readonly loadingSiblings = signal(false);
  /** Ids de reporte con la tarjeta expandida (varios a la vez). */
  private readonly expandedIds = signal<Set<string>>(new Set());

  readonly canVerify = computed(() => {
    const transaction = this.transaction();
    return (
      transaction !== null &&
      isTransactionVerifiable(transaction.status, transaction.verification.canBeConsideredPaid)
    );
  });

  readonly canApplyInvoice = computed(() => {
    const transaction = this.transaction();
    return transaction !== null && isTransactionInvoiceable(transaction.status);
  });
  readonly loading = signal(false);
  readonly error = signal('');

  private loadedId: string | null = null;

  constructor() {
    effect(() => {
      const event = this.event();
      if (!event) {
        this.loadedId = null;
        this.detail.set(null);
        this.transaction.set(null);
        this.referenceMatches.set([]);
        this.siblingEvents.set([]);
        this.expandedIds.set(new Set());
        this.error.set('');
        return;
      }
      if (event.id === this.loadedId) {
        return;
      }
      this.loadedId = event.id;
      this.detail.set(event);
      this.transaction.set(null);
      this.referenceMatches.set([]);
      this.siblingEvents.set([]);
      // El reporte que abrió el modal arranca expandido; el resto se abre a
      // demanda, sin perder lo ya abierto ("conforme se abra, se ve").
      this.expandedIds.set(new Set([event.id]));
      this.loadDetail(event.id);
    });
  }

  readonly title = computed(() => {
    const count = this.reports().length;
    return count > 1 ? `Detalle del pago (${count} reportes)` : 'Detalle del pago';
  });

  /**
   * Todos los reportes (source_events) confirmados de esta operación: el
   * evento sobre el que se abrió el modal + sus hermanos enlazados a la
   * misma transacción. Ordenados por llegada (el primero que creó el
   * registro, primero), así la lista cuenta la historia en orden.
   */
  readonly reports = computed<SourceEvent[]>(() => {
    const anchor = this.detail();
    if (!anchor) return [];
    const byId = new Map<string, SourceEvent>([[anchor.id, anchor]]);
    for (const sibling of this.siblingEvents()) {
      byId.set(sibling.id, sibling);
    }
    return [...byId.values()].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  });

  /** `referenceMatches` menos lo que ya está confirmado en `reports()` —
   *  reactivo: si un "posible relacionado" termina confirmándose como
   *  hermano (p. ej. cuando terminan de cargar), desaparece de aquí solo. */
  readonly relatedEvents = computed(() => {
    const confirmedIds = new Set(this.reports().map((report) => report.id));
    return this.referenceMatches().filter((item) => !confirmedIds.has(item.id));
  });

  /** Monto a destacar arriba: el de la transacción si ya hay una (fuente
   *  autoritativa, la misma para todos los reportes); si no, el del evento. */
  readonly amount = computed(
    () => this.transaction()?.amount ?? this.detail()?.normalized?.amount ?? null,
  );

  readonly amountCurrency = computed(
    () => this.transaction()?.currency ?? this.detail()?.normalized?.currency ?? 'COP',
  );

  /** Estado a destacar arriba: el de la transacción (más significativo para
   *  el negocio) si ya está enlazada; si no, "sin confirmar todavía". */
  readonly statusLabelTop = computed(() => {
    const tx = this.transaction();
    return tx ? transactionStatusLabel(tx.status) : 'Sin confirmar todavía';
  });

  readonly statusToneTop = computed<TransactionTone>(() => {
    const tx = this.transaction();
    return tx ? transactionTone(tx.status) : 'neutral';
  });

  isExpanded(report: SourceEvent): boolean {
    return this.expandedIds().has(report.id);
  }

  /** Es el reporte con el que se abrió el modal (no el "primero" cronológico). */
  isAnchor(report: SourceEvent): boolean {
    return report.id === this.detail()?.id;
  }

  toggleReport(report: SourceEvent): void {
    this.expandedIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(report.id)) {
        next.delete(report.id);
      } else {
        next.add(report.id);
      }
      return next;
    });
  }

  reportIcon(report: SourceEvent): 'mail' | 'smartphone' | 'monitor' {
    if (report.sourceType === 'EMAIL_GMAIL') {
      return 'mail';
    }
    return this.deviceLabel(report) === 'Desktop' ? 'monitor' : 'smartphone';
  }

  /**
   * Solo se muestra cuando el banco declaró la fecha en el propio texto del
   * mensaje (`transactionDateSource === 'text'`); si vino de un respaldo
   * (header/postTime/capturedAt) no podemos afirmar que sea la fecha que el
   * banco reportó, así que se marca como no detectada.
   */
  bankDate(event: SourceEvent): string {
    if (event.normalized?.transactionDateSource !== 'text') return 'No detectada';
    return this.formatDateTime(event.normalized?.transactionDate);
  }

  forwardedDate(event: SourceEvent): string {
    return this.formatDateTime(event.rawPayload?.['date']);
  }

  eventDate(event: SourceEvent): string {
    return this.formatDateTime(event.createdAt);
  }

  transferDate(event: SourceEvent): string {
    return this.formatDateTime(event.normalized?.transactionDate);
  }

  /**
   * Cuenta destino: la cuenta YEP a la que el backend ENLAZÓ el evento
   * (`reportedBankAccount`, resuelta por política — p. ej. Nequi por unicidad),
   * mostrada como "nombre ····1234". Si no se resolvió, cae a la cuenta extraída
   * del texto (`receiverAccount`) y, si tampoco, a "No detectada".
   */
  destinationAccount(event: SourceEvent): string {
    const acc = event.reportedBankAccount;
    if (acc) {
      const name = acc.displayName || acc.holderName || acc.bankId;
      return `${name} ····${acc.accountNumberLast4}`;
    }
    return (
      event.normalized?.receiverAccount ||
      event.normalized?.receiverBreBKeyDisplay?.trim() ||
      event.normalized?.receiverBreBKey ||
      'No detectada'
    );
  }

  senderName(event: SourceEvent): string {
    return event.normalized?.senderName?.trim() || 'N/A';
  }

  /**
   * La llave Bre-B tal como se detectó (con `@`/mayúsculas originales, si el
   * backend la guardó) — no la forma normalizada (`receiverBreBKey`), que
   * pierde el `@` y por eso puede confundirse con una llave numérica distinta.
   */
  keyName(event: SourceEvent): string {
    return (
      event.normalized?.receiverBreBKeyDisplay?.trim() ||
      event.normalized?.receiverBreBKey?.trim() ||
      this.extractKeyFromText(event) ||
      'N/A'
    );
  }

  sourceLabel(event: SourceEvent): string {
    return event.sourceType === 'EMAIL_GMAIL' ? 'Correo' : 'Notificador';
  }

  deviceLabel(event: SourceEvent): string {
    if (event.sourceType !== 'NOTIFIER_APP') {
      return 'Correo';
    }
    const device = event.rawPayload?.['device'] as { osVersion?: unknown } | undefined;
    const os = typeof device?.osVersion === 'string' ? device.osVersion.toLowerCase() : '';
    return os.includes('windows') || os.includes('mac') || os.includes('linux')
      ? 'Desktop'
      : 'Celular';
  }

  statusLabel(status: SourceEventStatus): string {
    const labels: Record<SourceEventStatus, string> = {
      received: 'Recibido',
      processing: 'Procesando',
      processed: 'Procesado',
      needs_review: 'Por revisar',
      failed: 'Fallo',
      ignored: 'Ignorado',
    };
    return labels[status] ?? status;
  }

  rawNotificationText(event: SourceEvent | null): string {
    if (!event) {
      return '';
    }
    if (event.sourceType === 'EMAIL_GMAIL') {
      return [
        event.rawPayload?.['subject'],
        event.rawPayload?.['snippet'],
        event.rawPayload?.['bodyText'],
      ]
        .map((part) => (typeof part === 'string' ? part.trim() : ''))
        .filter(Boolean)
        .join('\n\n');
    }
    const notification = event.rawPayload?.['notification'] as
      | { title?: unknown; text?: unknown; bigText?: unknown }
      | undefined;
    return [notification?.title, notification?.text, notification?.bigText]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join('\n\n');
  }

  private extractKeyFromText(event: SourceEvent): string {
    const match = this.rawNotificationText(event).match(/\bllave\s+([A-Za-z0-9@._+-]*[A-Za-z0-9])/i);
    return match?.[1]?.trim() ?? '';
  }

  private formatDateTime(value: unknown): string {
    const date = this.toDate(value);
    if (!date) return 'No detectada';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: BOGOTA_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '00';
    return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
  }

  private toDate(value: unknown): Date | null {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private loadDetail(eventId: string): void {
    this.loading.set(true);
    this.error.set('');
    this.sourceEventsApi
      .get(eventId)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ sourceEvent }) => {
          this.detail.set(sourceEvent);
          this.loadTransaction(sourceEvent);
          this.loadRelatedEvents(sourceEvent);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  private loadTransaction(event: SourceEvent): void {
    if (!event.linkedTransactionId) {
      return;
    }
    this.transactionsApi
      .get(event.linkedTransactionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ transaction }) => {
          this.transaction.set(transaction);
          this.loadSiblingEvents(event.id, transaction);
        },
        error: () => this.transaction.set(null),
      });
  }

  /**
   * Trae el detalle completo de los demás reportes ya enlazados a la misma
   * transacción (`transaction.events`), para poder mostrarlos todos en la
   * misma pantalla en vez de navegar a cada uno por separado.
   */
  private loadSiblingEvents(anchorId: string, transaction: PaymentTransaction): void {
    const ids = [...new Set((transaction.events ?? []).map((linked) => linked.eventId))].filter(
      (id) => id !== anchorId,
    );
    if (ids.length === 0) {
      this.siblingEvents.set([]);
      return;
    }
    this.loadingSiblings.set(true);
    forkJoin(
      ids.map((id) =>
        // Best-effort por hermano: si uno falla al cargar, no tumba a los
        // demás — simplemente no aparece (el usuario todavía ve los que sí).
        this.sourceEventsApi.get(id).pipe(catchError(() => of(null))),
      ),
    )
      .pipe(
        finalize(() => this.loadingSiblings.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((responses) => {
        this.siblingEvents.set(
          responses
            .filter((response): response is { sourceEvent: SourceEvent } => response !== null)
            .map((response) => response.sourceEvent),
        );
      });
  }

  private loadRelatedEvents(event: SourceEvent): void {
    const reference = event.normalized?.reference;
    if (!reference) {
      return;
    }
    this.sourceEventsApi
      .list({
        q: reference,
        sourceTypes: MONEY_REPORT_SOURCE_TYPES,
        statuses: MONEY_REPORT_STATUSES,
        limit: 10,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ sourceEvents }) => this.referenceMatches.set(sourceEvents),
        error: () => this.referenceMatches.set([]),
      });
  }
}
