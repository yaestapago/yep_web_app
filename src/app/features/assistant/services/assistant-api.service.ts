import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

export interface AssistantMessageRequest {
  message: string;
  conversationId?: string;
  /** Pregunta del menú con respuesta preparada (no gasta el tope del negocio). */
  presetId?: string;
}

export interface AssistantMessageResponse {
  /** `null` si la primera pregunta no se pudo responder (no se guardó nada). */
  conversationId: string | null;
  reply: string;
}

/**
 * Zaira, la asistente del panel (`POST /assistant/messages`). El negocio va
 * explícito en `x-business-account-id`: la conversación queda atada al negocio
 * que estaba activo al preguntar, aunque el usuario lo cambie mientras tanto.
 */
@Injectable({ providedIn: 'root' })
export class AssistantApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/assistant/messages`;

  send(
    request: AssistantMessageRequest,
    businessAccountId: string | null,
  ): Observable<AssistantMessageResponse> {
    return this.http.post<AssistantMessageResponse>(this.url, request, {
      headers: businessAccountId
        ? new HttpHeaders({ 'x-business-account-id': businessAccountId })
        : undefined,
    });
  }
}
