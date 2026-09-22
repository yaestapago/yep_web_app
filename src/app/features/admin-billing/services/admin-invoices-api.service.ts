import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type {
  BillingInvoiceStatus,
  BillingInvoiceSummary,
  InvoiceVoucherUrl,
} from '../../../shared/models/billing.models';

@Injectable({ providedIn: 'root' })
export class AdminInvoicesApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(): Observable<BillingInvoiceSummary[]> {
    return this.http.get<BillingInvoiceSummary[]>(`${this.apiUrl}/admin/invoices`);
  }

  getVoucherUrl(id: string): Observable<InvoiceVoucherUrl> {
    return this.http.get<InvoiceVoucherUrl>(`${this.apiUrl}/admin/invoices/${id}/voucher`);
  }

  updateStatus(
    id: string,
    status: Extract<BillingInvoiceStatus, 'paid' | 'cancelled'>,
  ): Observable<BillingInvoiceSummary> {
    return this.http.patch<BillingInvoiceSummary>(`${this.apiUrl}/admin/invoices/${id}/status`, {
      status,
    });
  }
}
