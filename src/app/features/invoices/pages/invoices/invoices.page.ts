import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideLoaderCircle, LucideReceipt, LucideRefreshCw } from '@lucide/angular';
import { finalize } from 'rxjs';

import type { BillingInvoiceSummary } from '../../../../shared/models/billing.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Modal } from '../../../../shared/ui/modal/modal';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { InvoicesApiService } from '../../services/invoices-api.service';

@Component({
  selector: 'app-invoices-page',
  imports: [DatePipe, Alert, Button, Modal, LucideLoaderCircle, LucideReceipt, LucideRefreshCw],
  templateUrl: './invoices.page.html',
  styleUrl: './invoices.page.scss',
})
export class InvoicesPage implements OnInit {
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly invoices = signal<BillingInvoiceSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedInvoice = signal<BillingInvoiceSummary | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.invoicesApi
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

  open(invoice: BillingInvoiceSummary): void {
    this.selectedInvoice.set(invoice);
  }

  close(): void {
    this.selectedInvoice.set(null);
  }

  statusLabel(status: BillingInvoiceSummary['status']): string {
    switch (status) {
      case 'paid':
        return 'Pagada';
      case 'reported':
        return 'Pago reportado (en revision)';
      case 'cancelled':
        return 'Cancelada';
      default:
        return 'Emitida';
    }
  }

  formatCop(value: number): string {
    return `${new Intl.NumberFormat('es-CO').format(value)} COP`;
  }
}
