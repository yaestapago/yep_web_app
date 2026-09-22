import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import type {
  SubscriptionCreationMetric,
  SubscriptionCreationPermissionResponse,
  SubscriptionOverviewResponse,
} from '../../../shared/models/auth.models';
import type {
  AddOnPricingResponse,
  BillingInvoiceSummary,
  ChangePlanResponse,
  CreatePlanChangeRequestPayload,
  PlanChangeRequestSummary,
} from '../../../shared/models/billing.models';

@Injectable({ providedIn: 'root' })
export class SubscriptionsApiService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(AuthSessionService);
  private readonly apiUrl = environment.apiUrl;

  overview(): Observable<SubscriptionOverviewResponse> {
    return this.http.get<SubscriptionOverviewResponse>(
      `${this.apiUrl}/subscriptions/me`,
      this.businessAccountOptions(),
    );
  }

  changePlan(
    planCode: string,
    billingPeriod?: 'monthly' | 'annual',
  ): Observable<ChangePlanResponse> {
    return this.http.post<ChangePlanResponse>(
      `${this.apiUrl}/subscriptions/change-plan`,
      { planCode, billingPeriod },
      this.businessAccountOptions(),
    );
  }

  reportPayment(note?: string): Observable<BillingInvoiceSummary> {
    return this.http.post<BillingInvoiceSummary>(
      `${this.apiUrl}/subscriptions/report-payment`,
      { note },
      this.businessAccountOptions(),
    );
  }

  createChangeRequest(
    payload: CreatePlanChangeRequestPayload,
  ): Observable<PlanChangeRequestSummary> {
    return this.http.post<PlanChangeRequestSummary>(
      `${this.apiUrl}/subscriptions/change-requests`,
      payload,
      this.businessAccountOptions(),
    );
  }

  myChangeRequests(): Observable<PlanChangeRequestSummary[]> {
    return this.http.get<PlanChangeRequestSummary[]>(
      `${this.apiUrl}/subscriptions/change-requests`,
      this.businessAccountOptions(),
    );
  }

  addonPricing(): Observable<AddOnPricingResponse> {
    return this.http.get<AddOnPricingResponse>(`${this.apiUrl}/subscriptions/addon-pricing`);
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
