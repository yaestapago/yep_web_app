import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type {
  DuplicatesQuery,
  DuplicatesResponse,
  ReconciliationQuery,
  ReconciliationResponse,
  ResolveDuplicateRequest,
} from '../../../shared/models/insight.models';

@Injectable({ providedIn: 'root' })
export class InsightsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  reconciliation(query: ReconciliationQuery): Observable<ReconciliationResponse> {
    return this.http.get<ReconciliationResponse>(`${this.apiUrl}/insights/reconciliation`, {
      params: this.toParams({ direction: 'both', ...query }),
    });
  }

  duplicates(query: DuplicatesQuery = {}): Observable<DuplicatesResponse> {
    return this.http.get<DuplicatesResponse>(`${this.apiUrl}/insights/duplicates`, {
      params: this.toParams(query),
    });
  }

  resolveDuplicate(
    supportId: string,
    request: ResolveDuplicateRequest,
  ): Observable<unknown> {
    return this.http.post(
      `${this.apiUrl}/insights/duplicates/${supportId}/resolve`,
      request,
    );
  }

  private toParams(query: object): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query) as [string, unknown][]) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return params;
  }
}
