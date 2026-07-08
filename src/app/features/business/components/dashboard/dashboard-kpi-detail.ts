import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, input as defineInput, output } from '@angular/core';
import { LucideLoaderCircle } from '@lucide/angular';

import type { SourceEvent } from '../../../../shared/models/source-event.models';
import type { PaymentTransaction } from '../../../../shared/models/transaction.models';
import { Modal } from '../../../../shared/ui/modal/modal';
import { transactionStatusLabel, transactionTone } from '../../../../shared/utils/transaction-status';

export type KpiDetailKind = 'transactions' | 'events';

@Component({
  selector: 'app-dashboard-kpi-detail',
  imports: [CurrencyPipe, DatePipe, LucideLoaderCircle, Modal],
  templateUrl: './dashboard-kpi-detail.html',
  styleUrls: ['./dashboard-shared.scss', './dashboard-kpi-detail.scss'],
})
export class DashboardKpiDetailPanel {
  readonly open = defineInput(false);
  readonly title = defineInput('');
  readonly kind = defineInput<KpiDetailKind>('transactions');
  readonly transactions = defineInput<PaymentTransaction[]>([]);
  readonly events = defineInput<SourceEvent[]>([]);
  readonly loading = defineInput(false);
  readonly close = output<void>();
  readonly viewTransaction = output<PaymentTransaction>();
  readonly viewEvent = output<SourceEvent>();

  statusLabel(transaction: PaymentTransaction): string {
    return transactionStatusLabel(transaction.status);
  }

  tone(transaction: PaymentTransaction): string {
    return transactionTone(transaction.status);
  }

  eventBody(event: SourceEvent): string {
    const notification = event.rawPayload?.['notification'] as
      | { text?: unknown; bigText?: unknown }
      | undefined;
    return (
      [notification?.text, notification?.bigText, event.rawPayload?.['snippet'], event.rawPayload?.['bodyText']]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .at(0) ?? 'Sin texto'
    );
  }
}
