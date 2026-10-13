import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideReceipt, LucideRefreshCw } from '@lucide/angular';
import { finalize } from 'rxjs';

import { BillingStatusService } from '../../../../core/services/billing-status.service';
import type {
  BillingInvoiceStatus,
  BillingInvoiceSummary,
} from '../../../../shared/models/billing.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Card } from '../../../../shared/ui/card/card';
import { DescriptionItem } from '../../../../shared/ui/description-list/description-item';
import { DescriptionList } from '../../../../shared/ui/description-list/description-list';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { State } from '../../../../shared/ui/state/state';
import { StatusChip, type StatusChipTone } from '../../../../shared/ui/status-chip/status-chip';
import { Table } from '../../../../shared/ui/table/table';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { InvoicesApiService } from '../../services/invoices-api.service';

@Component({
  selector: 'app-invoices-page',
  imports: [
    DatePipe,
    FormsModule,
    Alert,
    Button,
    Input,
    Modal,
    PageHeader,
    Card,
    Table,
    State,
    StatusChip,
    DescriptionList,
    DescriptionItem,
    LucideReceipt,
    LucideRefreshCw,
  ],
  templateUrl: './invoices.page.html',
  styleUrl: './invoices.page.scss',
})
export class InvoicesPage implements OnInit {
  private readonly invoicesApi = inject(InvoicesApiService);
  private readonly billing = inject(BillingStatusService);
  private readonly destroyRef = inject(DestroyRef);

  readonly invoices = signal<BillingInvoiceSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly selectedInvoice = signal<BillingInvoiceSummary | null>(null);
  readonly reportInvoice = signal<BillingInvoiceSummary | null>(null);
  readonly reportNote = signal('');
  readonly reportFile = signal<File | null>(null);
  readonly reporting = signal(false);

  /** Tono del chip de estado (solo presentación). */
  protected readonly statusTones: Record<BillingInvoiceStatus, StatusChipTone> = {
    issued: 'warning',
    reported: 'info',
    paid: 'success',
    cancelled: 'neutral',
  };

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

  openReportPayment(invoice: BillingInvoiceSummary): void {
    this.error.set('');
    this.reportNote.set('');
    this.reportFile.set(null);
    this.reportInvoice.set(invoice);
  }

  closeReportPayment(): void {
    if (!this.reporting()) {
      this.reportInvoice.set(null);
    }
  }

  submitReportPayment(): void {
    const invoice = this.reportInvoice();
    const file = this.reportFile();
    if (!invoice || !file) {
      this.error.set('Adjunta el comprobante de pago.');
      return;
    }

    this.reporting.set(true);
    this.error.set('');
    this.success.set('');
    this.invoicesApi
      .reportPayment(invoice.id, file, this.reportNote().trim() || undefined)
      .pipe(
        finalize(() => this.reporting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.invoices.update((invoices) =>
            invoices.map((current) => (current.id === updated.id ? updated : current)),
          );
          if (this.selectedInvoice()?.id === updated.id) {
            this.selectedInvoice.set(updated);
          }
          this.reportInvoice.set(null);
          this.success.set('Pago reportado. Nuestro equipo revisará la información.');
          // Un pago reportado deja el negocio "en revisión" (no bloqueado).
          void this.billing.refresh();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  onVoucherSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.reportFile.set(input.files?.[0] ?? null);
  }

  openVoucher(invoice: BillingInvoiceSummary): void {
    this.error.set('');
    const target = window.open('', '_blank');
    this.invoicesApi
      .getVoucherUrl(invoice.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ url }) => {
          if (target) target.location.href = url;
          else window.open(url, '_blank', 'noopener');
        },
        error: (error) => {
          target?.close();
          this.error.set(httpErrorMessage(error));
        },
      });
  }

  statusLabel(status: BillingInvoiceSummary['status']): string {
    switch (status) {
      case 'paid':
        return 'Pagada';
      case 'reported':
        return 'Pago reportado (en revisión)';
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
