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
import { SourceEventsApiService } from '../../../source-events/services/source-events-api.service';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';

const MONEY_REPORT_SOURCE_TYPES: SourceEventType[] = ['NOTIFIER_APP', 'EMAIL_GMAIL'];
const MONEY_REPORT_STATUSES: SourceEventStatus[] = [
  'received',
  'processing',
  'processed',
  'failed',
];

@Component({
  selector: 'app-source-event-detail-modal',
  imports: [CurrencyPipe, DatePipe, JsonPipe, Button, Modal],
  templateUrl: './source-event-detail-modal.html',
  styleUrl: './source-event-detail-modal.scss',
})
export class SourceEventDetailModal {
  private readonly sourceEventsApi = inject(SourceEventsApiService);
  private readonly transactionsApi = inject(TransactionsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly event = input<SourceEvent | null>(null);
  readonly close = output<void>();

  readonly open = computed(() => this.event() !== null);
  readonly detail = signal<SourceEvent | null>(null);
  readonly transaction = signal<PaymentTransaction | null>(null);
  readonly relatedEvents = signal<SourceEvent[]>([]);
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
    return event.normalized?.receiverAccount || 'No detectada';
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
