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
import { finalize } from 'rxjs';

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
const ENGLISH_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

@Component({
  selector: 'app-source-event-detail-modal',
  imports: [CurrencyPipe, DatePipe, JsonPipe, Button, Modal, TransactionSupportsPanel],
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
  /** Pide a la sección padre abrir el detalle de OTRO evento (por su id) —
   *  p. ej. un evento bancario hermano listado en la transacción enlazada. */
  readonly viewOtherEvent = output<string>();
  /** Pide a la sección padre abrir el modal de verificación manual. */
  readonly verifyRequested = output<PaymentTransaction>();
  /** Pide a la sección padre abrir el modal de "aplicar a factura". */
  readonly invoiceRequested = output<PaymentTransaction>();

  readonly open = computed(() => this.event() !== null);
  readonly detail = signal<SourceEvent | null>(null);
  readonly transaction = signal<PaymentTransaction | null>(null);
  readonly relatedEvents = signal<SourceEvent[]>([]);

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
        this.relatedEvents.set([]);
        this.error.set('');
        return;
      }
      if (event.id === this.loadedId) {
        return;
      }
      this.loadedId = event.id;
      this.detail.set(event);
      this.transaction.set(null);
      this.relatedEvents.set([]);
      this.loadDetail(event.id);
    });
  }

  readonly title = computed(() => {
    const event = this.detail() ?? this.event();
    return event?.sourceType === 'EMAIL_GMAIL'
      ? 'Detalle del correo'
      : 'Detalle de la notificacion';
  });

  readonly notificationText = computed(() =>
    this.rawNotificationText(this.detail() ?? this.event()),
  );

  readonly amount = computed(() => this.detail()?.normalized?.amount ?? null);

  bankDate(event: SourceEvent): string {
    return this.formatDateTime(this.extractForwardedSentDate(event));
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
    return event.normalized?.receiverAccount || event.normalized?.receiverBreBKey || 'No detectada';
  }

  senderName(event: SourceEvent): string {
    return event.normalized?.senderName?.trim() || 'N/A';
  }

  keyName(event: SourceEvent): string {
    return event.normalized?.receiverBreBKey?.trim() || this.extractKeyFromText(event) || 'N/A';
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

  private extractForwardedSentDate(event: SourceEvent): Date | null {
    if (event.sourceType !== 'EMAIL_GMAIL') return null;
    const text = [event.rawPayload?.['bodyText'], event.rawPayload?.['snippet']]
      .map((part) => (typeof part === 'string' ? part : ''))
      .filter(Boolean)
      .join('\n');
    const sentLine =
      text.match(/(?:^|\n)\s*Sent:\s*([^\r\n]+)/i)?.[1] ??
      text.match(/\bSent:\s*(.+?)(?=\s+(?:To|Subject|From):|$)/i)?.[1];
    return sentLine ? this.parseForwardedSentLine(sentLine) : null;
  }

  private parseForwardedSentLine(value: string): Date | null {
    const line = value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    const offset = line.match(/\(UTC([+-]\d{2}:\d{2})\)/i)?.[1] ?? '-05:00';
    const match = line.match(
      /(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i,
    );
    if (!match) return this.toDate(line);
    const [, monthName, day, year, hourRaw, minute, secondRaw, meridiem] = match;
    const month = ENGLISH_MONTHS[monthName.toLowerCase()];
    if (!month) return null;
    let hour = Number(hourRaw);
    if (meridiem?.toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (meridiem?.toUpperCase() === 'AM' && hour === 12) hour = 0;
    const iso = `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${minute}:${(secondRaw ?? '00').padStart(2, '0')}${offset}`;
    const date = new Date(iso);
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
        next: ({ transaction }) => this.transaction.set(transaction),
        error: () => this.transaction.set(null),
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
        next: ({ sourceEvents }) =>
          this.relatedEvents.set(sourceEvents.filter((item) => item.id !== event.id)),
        error: () => this.relatedEvents.set([]),
      });
  }
}
