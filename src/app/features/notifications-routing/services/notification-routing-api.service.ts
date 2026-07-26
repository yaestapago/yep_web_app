import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  CreateNotificationRoutingRequest,
  DeleteNotificationRoutingResponse,
  NotificationRoutingRuleResponse,
  NotificationRoutingRulesResponse,
  UpdateNotificationRoutingRequest,
} from '../../../shared/models/notification-routing.models';

@Injectable({ providedIn: 'root' })
export class NotificationRoutingApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(): Observable<NotificationRoutingRulesResponse> {
    return this.http.get<NotificationRoutingRulesResponse>(
      `${this.apiUrl}/notifications-routing`,
    );
  }

  get(id: string): Observable<NotificationRoutingRuleResponse> {
    return this.http.get<NotificationRoutingRuleResponse>(
      `${this.apiUrl}/notifications-routing/${id}`,
    );
  }

  create(
    request: CreateNotificationRoutingRequest,
  ): Observable<NotificationRoutingRuleResponse> {
    return this.http.post<NotificationRoutingRuleResponse>(
      `${this.apiUrl}/notifications-routing`,
      request,
    );
  }

  update(
    id: string,
    request: UpdateNotificationRoutingRequest,
  ): Observable<NotificationRoutingRuleResponse> {
    return this.http.patch<NotificationRoutingRuleResponse>(
      `${this.apiUrl}/notifications-routing/${id}`,
      request,
    );
  }

  remove(id: string): Observable<DeleteNotificationRoutingResponse> {
    return this.http.delete<DeleteNotificationRoutingResponse>(
      `${this.apiUrl}/notifications-routing/${id}`,
    );
  }

  toggle(id: string): Observable<NotificationRoutingRuleResponse> {
    return this.http.post<NotificationRoutingRuleResponse>(
      `${this.apiUrl}/notifications-routing/${id}/toggle`,
      {},
    );
  }
}
