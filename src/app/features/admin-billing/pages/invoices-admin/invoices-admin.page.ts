import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LucideLoaderCircle, LucideRefreshCw } from '@lucide/angular';
import { finalize } from 'rxjs';

import type {
  BillingInvoiceStatus,
  BillingInvoiceSummary,
} from '../../../../shared/models/billing.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AdminInvoicesApiService } from '../../services/admin-invoices-api.service';

@Component({
  selector: 'app-invoices-admin-page',
  imports: [DatePipe, FormsModule, Alert, Button, LucideLoaderCircle, LucideRefreshCw],
  templateUrl: './invoices-admin.page.html',
  styleUrl: './invoices-admin.page.scss',
})
export class InvoicesAdminPage implements OnInit {
  private readonly api = inject(AdminInvoicesApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  readonly invoices = signal<BillingInvoiceSummary[]>([]);
  readonly loading = signal(false);
  readonly actingId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly search = signal(this.route.snapshot.queryParamMap.get('business') ?? '');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly statusOptions: Array<BillingInvoiceStatus | 'all'> = [
    'reported',
    'issued',
    'paid',
    'cancelled',
    'all',
  ];
  readonly statusFilter = signal<BillingInvoiceStatus | 'all'>(
    this.initialStatus(this.route.snapshot.queryParamMap.get('status')),
  );

  readonly filteredInvoices = computed(() => {
    const filter = this.statusFilter();
    const query = this.search().trim().toLocaleLowerCase();
    const from = this.dateFrom() ? new Date(`${this.dateFrom()}T00:00:00`).getTime() : null;
    const to = this.dateTo() ? new Date(`${this.dateTo()}T23:59:59.999`).getTime() : null;
    return this.invoices().filter((invoice) => {
      if (filter !== 'all' && invoice.status !== filter) return false;
      const issuedAt = new Date(invoice.issuedAt).getTime();
      if (from !== null && issuedAt < from) return false;
      if (to !== null && issuedAt > to) return false;
      if (!query) return true;
      return [
        invoice.invoiceNumber,
        invoice.accountName,
        invoice.buyerName,
        invoice.buyerEmail,
        invoice.buyerIdentification,
        invoice.concept,
      ].some((value) => value?.toLocaleLowerCase().includes(query));
    });
  });

  clearFilters(): void {
    this.search.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.statusFilter.set('all');
  }

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

  private initialStatus(value: string | null): BillingInvoiceStatus | 'all' {
    return value && this.statusOptions.includes(value as BillingInvoiceStatus)
      ? (value as BillingInvoiceStatus)
      : 'reported';
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
