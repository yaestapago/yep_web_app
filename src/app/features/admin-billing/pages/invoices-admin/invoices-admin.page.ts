import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideLoaderCircle, LucideRefreshCw } from '@lucide/angular';
import { finalize } from 'rxjs';

import type { BillingInvoiceStatus, BillingInvoiceSummary } from '../../../../shared/models/billing.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AdminInvoicesApiService } from '../../services/admin-invoices-api.service';

@Component({
  selector: 'app-invoices-admin-page',
  imports: [DatePipe, Alert, Button, LucideLoaderCircle, LucideRefreshCw],
  templateUrl: './invoices-admin.page.html',
  styleUrl: './invoices-admin.page.scss',
})
export class InvoicesAdminPage implements OnInit {
  private readonly api = inject(AdminInvoicesApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly invoices = signal<BillingInvoiceSummary[]>([]);
  readonly loading = signal(false);
  readonly actingId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly statusFilter = signal<BillingInvoiceStatus | 'all'>('reported');
  readonly statusOptions: Array<BillingInvoiceStatus | 'all'> = [
    'reported',
    'issued',
    'paid',
    'cancelled',
    'all',
  ];

  readonly filteredInvoices = computed(() => {
    const filter = this.statusFilter();
    const items = this.invoices();
    return filter === 'all' ? items : items.filter((inv) => inv.status === filter);
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .list()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (invoices) => this.invoices.set(invoices),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  markPaid(invoice: BillingInvoiceSummary): void {
    this.updateStatus(invoice, 'paid');
  }

  markCancelled(invoice: BillingInvoiceSummary): void {
    this.updateStatus(invoice, 'cancelled');
  }

  formatCop(value: number): string {
    return `${new Intl.NumberFormat('es-CO').format(value)} COP`;
  }

  private updateStatus(
    invoice: BillingInvoiceSummary,
    status: Extract<BillingInvoiceStatus, 'paid' | 'cancelled'>,
  ): void {
    this.actingId.set(invoice.id);
    this.error.set('');
    this.success.set('');

    this.api
      .updateStatus(invoice.id, status)
      .pipe(
        finalize(() => this.actingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.invoices.update((items) =>
            items.map((item) => (item.id === updated.id ? updated : item)),
          );
          this.success.set(
            status === 'paid'
              ? 'Factura marcada como pagada. Si venia de un upgrade o reactivacion, el plan ya se aplico.'
              : 'Factura cancelada.',
          );
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }
}
