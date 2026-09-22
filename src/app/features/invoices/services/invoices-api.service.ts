import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import type { BillingInvoiceSummary } from '../../../shared/models/billing.models';

@Injectable({ providedIn: 'root' })
export class InvoicesApiService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(AuthSessionService);
  private readonly apiUrl = environment.apiUrl;

  list(): Observable<BillingInvoiceSummary[]> {
    return this.http.get<BillingInvoiceSummary[]>(
      `${this.apiUrl}/invoices`,
      this.businessAccountOptions(),
    );
  }

  get(id: string): Observable<BillingInvoiceSummary> {
    return this.http.get<BillingInvoiceSummary>(
      `${this.apiUrl}/invoices/${id}`,
      this.businessAccountOptions(),
    );
  }

  reportPayment(id: string, note?: string): Observable<BillingInvoiceSummary> {
    return this.http.post<BillingInvoiceSummary>(
      `${this.apiUrl}/invoices/${id}/report-payment`,
      { note },
      this.businessAccountOptions(),
    );
  }

  private businessAccountOptions() {
    const businessAccountId = this.session.activeBusinessAccountId();
    return businessAccountId
      ? {
          headers: new HttpHeaders({
            'x-business-account-id': businessAccountId,
          }),
        }
      : undefined;
  }
}
