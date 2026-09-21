import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type {
  PlanChangeRequestStatus,
  PlanChangeRequestSummary,
  ReviewPlanChangeRequestPayload,
} from '../../../shared/models/billing.models';

/**
 * Vista de administración (solo superadmin) de solicitudes de cambio de plan.
 * Va contra `/admin/subscriptions/change-requests`, config global (no
 * `x-business-account-id`), mismo patrón que `AdminBanksApiService`.
 */
@Injectable({ providedIn: 'root' })
export class AdminPlanChangeRequestsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(status?: PlanChangeRequestStatus): Observable<PlanChangeRequestSummary[]> {
    let params = new HttpParams();
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<PlanChangeRequestSummary[]>(
      `${this.apiUrl}/admin/subscriptions/change-requests`,
      { params },
    );
  }

  approve(id: string, payload: ReviewPlanChangeRequestPayload) {
    return this.http.post<{
      request: PlanChangeRequestSummary;
      invoice: unknown;
    }>(`${this.apiUrl}/admin/subscriptions/change-requests/${id}/approve`, payload);
  }

  reject(id: string, payload: ReviewPlanChangeRequestPayload) {
    return this.http.post<PlanChangeRequestSummary>(
      `${this.apiUrl}/admin/subscriptions/change-requests/${id}/reject`,
      payload,
    );
  }
}
