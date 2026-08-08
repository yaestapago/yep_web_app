import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideLoaderCircle,
  LucideRefreshCw,
  LucideShieldAlert,
  LucideShieldCheck,
} from '@lucide/angular';
import { finalize } from 'rxjs';

import type { DashboardDateRange } from '../../../../shared/models/dashboard-summary.models';
import type {
  DuplicateInsightItem,
  DuplicateResolutionStatus,
  ReconciliationBankEvent,
  ReconciliationOrphanTransaction,
} from '../../../../shared/models/insight.models';
import { Button } from '../../../../shared/ui/button/button';
import {
  DateRangePicker,
  rangeForPreset,
  type DateRangePreset,
} from '../../../../shared/ui/date-range-picker/date-range-picker';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { InsightsApiService } from '../../services/insights-api.service';

const SOURCE_TYPE_LABELS: Record<string, string> = {
  EMAIL_GMAIL: 'Correo',
  BANK_SMS: 'SMS',
  BANK_WEBHOOK: 'Webhook',
  NOTIFIER_APP: 'Notificador',
};

/**
 * Conciliación (banco ↔ comprobante) y duplicados. Reusa /insights/reconciliation
 * y /insights/duplicates (backend), que hoy no tenían vista de frontend — ver
 * docs/refactor-mvp-yep.md, Fase 2.
 */
@Component({
  selector: 'app-business-insights-section',
  imports: [CurrencyPipe, DatePipe, Button, DateRangePicker, LucideLoaderCircle, LucideRefreshCw, LucideShieldAlert, LucideShieldCheck],
  templateUrl: './business-insights.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessInsightsSection implements OnInit {
  private readonly insightsApi = inject(InsightsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notifications = inject(NotificationModalService);

  readonly range = signal<DashboardDateRange>(rangeForPreset('30d'));
  readonly preset = signal<DateRangePreset>('30d');

  readonly loadingReconciliation = signal(false);
  readonly reconciliationError = signal('');
  readonly bankWithoutReceipt = signal<ReconciliationBankEvent[]>([]);
  readonly receiptWithoutBank = signal<ReconciliationOrphanTransaction[]>([]);

  readonly loadingDuplicates = signal(false);
  readonly loadingMoreDuplicates = signal(false);
  readonly duplicatesError = signal('');
  readonly duplicates = signal<DuplicateInsightItem[]>([]);
  readonly duplicatesCursor = signal<string | undefined>(undefined);
  readonly resolvingId = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  onRangeChange(value: { range: DashboardDateRange; preset: DateRangePreset }): void {
    this.range.set(value.range);
    this.preset.set(value.preset);
    this.refresh();
  }

  refresh(): void {
    this.loadReconciliation();
    this.loadDuplicates();
  }

  sourceTypeLabel(sourceType: string): string {
    return SOURCE_TYPE_LABELS[sourceType] ?? sourceType;
  }

  private loadReconciliation(): void {
    this.loadingReconciliation.set(true);
    this.reconciliationError.set('');
    const { from, to } = this.range();
    this.insightsApi
      .reconciliation({ from, to, direction: 'both' })
      .pipe(
        finalize(() => this.loadingReconciliation.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.bankWithoutReceipt.set(response.bankWithoutReceipt);
          this.receiptWithoutBank.set(response.receiptWithoutBank);
        },
        error: (error) => this.reconciliationError.set(httpErrorMessage(error)),
      });
  }

  private loadDuplicates(): void {
    this.loadingDuplicates.set(true);
    this.duplicatesError.set('');
    const { from, to } = this.range();
    this.insightsApi
      .duplicates({ from, to })
      .pipe(
        finalize(() => this.loadingDuplicates.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.duplicates.set(response.items);
          this.duplicatesCursor.set(response.nextCursor);
        },
        error: (error) => this.duplicatesError.set(httpErrorMessage(error)),
      });
  }

  loadMoreDuplicates(): void {
    const cursor = this.duplicatesCursor();
    if (!cursor || this.loadingMoreDuplicates()) {
      return;
    }
    this.loadingMoreDuplicates.set(true);
    const { from, to } = this.range();
    this.insightsApi
      .duplicates({ from, to, cursor })
      .pipe(
        finalize(() => this.loadingMoreDuplicates.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.duplicates.update((items) => [...items, ...response.items]);
          this.duplicatesCursor.set(response.nextCursor);
        },
        error: (error) => this.duplicatesError.set(httpErrorMessage(error)),
      });
  }

  markNotDuplicate(item: DuplicateInsightItem): void {
    this.resolveDuplicate(item, 'false_positive');
  }

  async confirmFraud(item: DuplicateInsightItem): Promise<void> {
    const confirmed = await this.notifications.confirm({
      title: 'Confirmar fraude',
      message:
        'La transacción enlazada quedará rechazada y el cliente se marcará como sospechoso. Esta acción no se puede deshacer.',
      type: 'error',
      confirmText: 'Confirmar fraude',
    });
    if (!confirmed) {
      return;
    }
    this.resolveDuplicate(item, 'confirmed_fraud');
  }

  private resolveDuplicate(
    item: DuplicateInsightItem,
    resolution: DuplicateResolutionStatus,
  ): void {
    this.resolvingId.set(item.id);
    this.duplicatesError.set('');
    this.insightsApi
      .resolveDuplicate(item.id, { resolution })
      .pipe(
        finalize(() => this.resolvingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.duplicates.update((items) => items.filter((current) => current.id !== item.id));
        },
        error: (error) => this.duplicatesError.set(httpErrorMessage(error)),
      });
  }
}
