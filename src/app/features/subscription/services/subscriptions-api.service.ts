import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type {
  SubscriptionCreationMetric,
  SubscriptionCreationPermissionResponse,
  SubscriptionOverviewResponse,
} from '../../../shared/models/auth.models';

@Injectable({ providedIn: 'root' })
export class SubscriptionsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  overview(): Observable<SubscriptionOverviewResponse> {
    return this.http.get<SubscriptionOverviewResponse>(`${this.apiUrl}/subscriptions/me`);
  }

  canCreate(
    metric: SubscriptionCreationMetric,
    businessAccountId?: string,
  ): Observable<SubscriptionCreationPermissionResponse> {
    let params = new HttpParams();
    if (businessAccountId) {
      params = params.set('businessAccountId', businessAccountId);
    }

    return this.http.get<SubscriptionCreationPermissionResponse>(
      `${this.apiUrl}/subscriptions/me/can-create/${metric}`,
      { params },
    );
  }
}
