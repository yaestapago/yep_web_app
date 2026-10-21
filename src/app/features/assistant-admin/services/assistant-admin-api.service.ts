import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type {
  AssistantConversationDetail,
  AssistantConversationPage,
  AssistantConversationQuery,
  AssistantUsage,
} from '../models/assistant-admin.models';

/**
 * Panel de superadmin de Zaira (`/admin/assistant/*`). Config global: viaja
 * solo con el Bearer, sin `x-business-account-id`.
 */
@Injectable({ providedIn: 'root' })
export class AssistantAdminApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/admin/assistant`;

  /** `GET /conversations` → `{ conversations, nextCursor? }`, lo más reciente primero. */
  listConversations(query: AssistantConversationQuery = {}): Observable<AssistantConversationPage> {
    let params = new HttpParams();
    if (query.flagged !== undefined) params = params.set('flagged', String(query.flagged));
    if (query.q?.trim()) params = params.set('q', query.q.trim());
    if (query.cursor) params = params.set('cursor', query.cursor);
    if (query.limit) params = params.set('limit', String(query.limit));
    return this.http.get<AssistantConversationPage>(`${this.url}/conversations`, { params });
  }

  /** `GET /conversations/:id` → la conversación con su transcripción y alertas. */
  conversation(id: string): Observable<AssistantConversationDetail> {
    return this.http
      .get<{
        conversation: AssistantConversationDetail;
      }>(`${this.url}/conversations/${encodeURIComponent(id)}`)
      .pipe(map((response) => response.conversation));
  }

  /** `GET /usage?month=` → gasto del mes por negocio contra el tope. */
  usage(month?: string): Observable<AssistantUsage> {
    const params = month ? new HttpParams().set('month', month) : undefined;
    return this.http.get<AssistantUsage>(`${this.url}/usage`, { params });
  }
}
