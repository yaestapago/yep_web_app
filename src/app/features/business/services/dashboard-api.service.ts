import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type {
  DashboardDateRange,
  DashboardSummary,
} from '../../../shared/models/dashboard-summary.models';

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  summary(range: DashboardDateRange): Observable<DashboardSummary> {
    const params = new HttpParams().set('from', range.from).set('to', range.to);
    return this.http.get<DashboardSummary>(`${this.apiUrl}/dashboard/summary`, { params });
  }
}
