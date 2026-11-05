import {
  HttpClient,
  HttpErrorResponse,
  HttpEvent,
  HttpEventType,
  HttpHeaders,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Observable,
  catchError,
  concatMap,
  first,
  from,
  mergeMap,
  of,
  tap,
  throwError,
} from 'rxjs';

import { environment } from '../../../../environments/environment';
import type { AssistantPageKey } from '../assistant-page';
import { AssistantStreamEvent, AssistantStreamReader } from '../assistant-stream';

export interface AssistantFocus {
  sourceEventId?: string;
  notifierId?: string;
}

export interface AssistantMessageRequest {
  message: string;
  conversationId?: string;
  /** Pregunta del menú con respuesta preparada (no gasta el tope del negocio). */
  presetId?: string;
  /** Pantalla abierta. El servidor pone la etiqueta: el cliente no le da texto al modelo. */
  page?: AssistantPageKey;
  focus?: AssistantFocus;
}

export type AssistantReplyKind = 'guide' | 'answer' | 'budget_reached' | 'no_answer';

export interface AssistantAction {
  type: 'open_route';
  label: string;
  route: AssistantPageKey;
  query?: Record<string, string>;
}

export interface AssistantFollowUp {
  label: string;
  presetId?: string;
}

/** Todo lo nuevo es opcional: un backend viejo solo manda `conversationId` y `reply`. */
export interface AssistantMessageResponse {
  /** `null` si la primera pregunta no se pudo responder (no se guardó nada). */
  conversationId: string | null;
  reply: string;
  turn?: number;
  kind?: AssistantReplyKind;
  actions?: AssistantAction[];
  followUps?: AssistantFollowUp[];
  offerSupport?: boolean;
  /** Mensaje de WhatsApp ya escrito, con el resumen del caso y sin datos sensibles. */
  supportText?: string;
}

export type AssistantSuggestionSeverity = 'info' | 'warn' | 'critical';

export interface AssistantSuggestion {
  id: string;
  title: string;
  text: string;
  /** Pregunta para el chat. Nunca trae texto de terceros: eso va por `focus`. */
  ask?: string;
  presetId?: string;
  severity: AssistantSuggestionSeverity;
  focus?: AssistantFocus;
  action?: AssistantAction;
}

export interface AssistantSuggestionsResponse {
  suggestions?: AssistantSuggestion[];
}

export type AssistantVote = 'up' | 'down';

export interface AssistantFeedbackRequest {
  conversationId: string;
  turn: number;
  value: AssistantVote;
  comment?: string;
}

export interface AssistantConversationResponse {
  conversationId: string;
  /** `turn`: el mismo de la respuesta en vivo, para calificar una respuesta restaurada. */
  turns?: { role: string; text: string; turn?: number }[];
}

/**
 * Cómo terminó el stream, además de sus eventos:
 * - `refused`: lo rechazó antes de empezar el turno (sesión, bloqueo, backend viejo). Repetir es seguro.
 * - `closed`: se cerró sin `done`. No se sabe qué pasó: el turno pudo correr y guardarse.
 */
type StreamEnd = AssistantStreamEvent | { t: 'refused' } | { t: 'closed' };

/**
 * Zaira, la asistente del panel. El negocio va explícito en `x-business-account-id`
 * (`authInterceptor` no lo agrega en `/assistant`): la conversación queda atada al negocio que
 * estaba activo al preguntar, aunque el usuario lo cambie mientras tanto.
 */
@Injectable({ providedIn: 'root' })
export class AssistantApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/assistant`;
  /** Pasa a `false` con un 404: backend viejo, no se insiste en cada pregunta. */
  private streamAvailable = true;
  /** El stream se cortó: el siguiente intento va por JSON, por si el que falla es él (un proxy). */
  private skipStreamOnce = false;

  send(
    request: AssistantMessageRequest,
    businessAccountId: string | null,
  ): Observable<AssistantMessageResponse> {
    return this.http.post<AssistantMessageResponse>(`${this.baseUrl}/messages`, request, {
      headers: businessHeaders(businessAccountId),
    });
  }

  /**
   * Igual que `send`, avisando con `onStatus` qué está revisando Zaira.
   *
   * La pregunta solo se repite sola por el endpoint JSON si el backend la rechazó antes de
   * empezar. Con un corte de red, un proxy caído o un cierre sin `done`, el turno pudo llegar y
   * seguir corriendo: repetirla lo cobraría dos veces al tope y la dejaría dos veces en el
   * historial, porque el backend no tiene idempotencia. Ahí se devuelve el error y la persona
   * decide con "Reintentar".
   */
  sendWithProgress(
    request: AssistantMessageRequest,
    businessAccountId: string | null,
    onStatus: (label: string) => void,
  ): Observable<AssistantMessageResponse> {
    if (!this.streamAvailable || this.skipStreamOnce) {
      this.skipStreamOnce = false;
      return this.send(request, businessAccountId);
    }

    const reader = new AssistantStreamReader();
    return this.http
      .post(`${this.baseUrl}/messages/stream`, request, {
        headers: businessHeaders(businessAccountId),
        observe: 'events',
        reportProgress: true,
        responseType: 'text',
      })
      .pipe(
        concatMap((event) => from(readStreamEvent(event, reader))),
        tap((event) => {
          if (event.t === 'status') onStatus(event.label);
        }),
        first((event) => event.t !== 'status'),
        catchError((error: unknown) => this.recoverStream(error)),
        mergeMap((end) => {
          if (end.t === 'done') {
            const { t: _t, ...response } = end;
            return of(response);
          }
          if (end.t === 'error') return throwError(() => streamHttpError(end));
          if (end.t === 'refused') return this.send(request, businessAccountId);
          this.skipStreamOnce = true;
          return throwError(() => new Error('El stream se cerró sin respuesta final'));
        }),
      );
  }

  suggestions(businessAccountId: string | null): Observable<AssistantSuggestionsResponse> {
    return this.http.get<AssistantSuggestionsResponse>(`${this.baseUrl}/suggestions`, {
      headers: businessHeaders(businessAccountId),
    });
  }

  feedback(
    request: AssistantFeedbackRequest,
    businessAccountId: string | null,
  ): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/feedback`, request, {
      headers: businessHeaders(businessAccountId),
    });
  }

  conversation(
    conversationId: string,
    businessAccountId: string | null,
  ): Observable<AssistantConversationResponse> {
    return this.http.get<AssistantConversationResponse>(
      `${this.baseUrl}/conversations/${encodeURIComponent(conversationId)}`,
      { headers: businessHeaders(businessAccountId) },
    );
  }

  /**
   * Con `responseType: 'text'` el cuerpo de un error llega como cadena y los interceptores no
   * lo reconocen: el 401 no renueva el token y el 402 no lleva a la pantalla de bloqueo. Esos
   * se repiten por el endpoint JSON, donde sí funcionan. Un rechazo claro del backend (429,
   * 409…) no se repite, porque daría lo mismo. Lo demás (sin respuesta o un cuerpo que no es del
   * backend) tampoco: no se sabe si el turno alcanzó a correr.
   */
  private recoverStream(error: unknown): Observable<StreamEnd> {
    if (!(error instanceof HttpErrorResponse)) return throwError(() => error);

    if (error.status === 404 || error.status === 405) this.streamAvailable = false;
    if ([401, 402, 404, 405].includes(error.status)) return of<StreamEnd>({ t: 'refused' });

    const body = parseJsonObject(error.error);
    if (!body) {
      this.skipStreamOnce = true;
      return throwError(() => error);
    }
    return throwError(
      () =>
        new HttpErrorResponse({
          error: body,
          status: error.status,
          statusText: error.statusText,
          url: error.url ?? undefined,
        }),
    );
  }
}

function businessHeaders(businessAccountId: string | null): HttpHeaders | undefined {
  return businessAccountId
    ? new HttpHeaders({ 'x-business-account-id': businessAccountId })
    : undefined;
}

function readStreamEvent(event: HttpEvent<string>, reader: AssistantStreamReader): StreamEnd[] {
  if (event.type === HttpEventType.DownloadProgress) {
    return reader.read(event.partialText ?? '');
  }
  if (event.type === HttpEventType.Response) {
    const body = event.body ?? '';
    return [...reader.read(body), ...reader.finish(body), { t: 'closed' }];
  }
  return [];
}

/** Un error dentro del stream se trata igual que el mismo error por HTTP. */
function streamHttpError(event: Extract<AssistantStreamEvent, { t: 'error' }>): HttpErrorResponse {
  const { t: _t, status, ...body } = event;
  return new HttpErrorResponse({ error: body, status: status ?? 503 });
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
