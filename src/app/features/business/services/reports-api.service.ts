import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type { DashboardDateRange } from '../../../shared/models/dashboard-summary.models';

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  cashSummaryPdf(
    businessAccountId: string,
    range: DashboardDateRange,
    locationId?: string,
  ): Observable<Blob> {
    let params = new HttpParams().set('from', range.from).set('to', range.to);
    if (locationId) {
      params = params.set('locationId', locationId);
    }
    return this.http.get(
      `${this.apiUrl}/business-accounts/${businessAccountId}/reports/cash-summary`,
      { params, responseType: 'blob' },
    );
  }

  cashSummaryCsv(
    businessAccountId: string,
    range: DashboardDateRange,
    locationId?: string,
  ): Observable<Blob> {
    let params = new HttpParams().set('from', range.from).set('to', range.to);
    if (locationId) {
      params = params.set('locationId', locationId);
    }
    return this.http.get(
      `${this.apiUrl}/business-accounts/${businessAccountId}/reports/cash-summary.csv`,
      { params, responseType: 'blob' },
    );
  }
}
