import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subscription, finalize } from 'rxjs';

import { AuthSessionService } from '../../../core/services/auth-session.service';
import { AssistantBlock, parseAssistantText } from '../assistant-text';
import { AssistantApiService } from './assistant-api.service';

export interface AssistantChatMessage {
  id: number;
  role: 'user' | 'assistant';
  blocks: AssistantBlock[];
  /** Mensaje de error de la web (no lo escribió Zaira). */
  error?: boolean;
}

export interface AssistantMenuItem {
  question: string;
  /**
   * Guía del backend (`ZAIRA_GUIDES` en `backend/src/assistant/zaira-guides.ts`):
   * se responde al instante y sin gastar el tope del negocio. Sin `presetId`,
   * la pregunta va al modelo (necesita mirar los datos del negocio).
   */
  presetId?: string;
}

/** Menú principal: las preguntas frecuentes que se ofrecen al abrir el chat. */
export const ASSISTANT_MENU: readonly AssistantMenuItem[] = [
  { question: '¿Cómo agrego un usuario?', presetId: 'agregar-usuario' },
  { question: '¿Cómo agrego un notificador?', presetId: 'agregar-notificador' },
  { question: '¿Cómo configuro los correos para que funcionen?', presetId: 'configurar-correos' },
  { question: '¿Por qué se están demorando mis notificaciones?' },
  { question: '¿Cuáles son los precios?', presetId: 'precios' },
  { question: '¿Ustedes acceden a mi cuenta bancaria?', presetId: 'acceso-banco' },
  {
    question: '¿Cómo agrego empleados y cómo los configuro?',
    presetId: 'configurar-empleados',
  },
  { question: '¿Cómo recibo alertas de WhatsApp?', presetId: 'alertas-whatsapp' },
];

/**
 * Estado del chat con Zaira. Vive en `root` para que la conversación siga
 * abierta al navegar entre páginas; se reinicia al cambiar de negocio activo
 * (cada conversación pertenece a un solo negocio).
 */
@Injectable({ providedIn: 'root' })
export class AssistantChatService {
  private readonly api = inject(AssistantApiService);
  private readonly session = inject(AuthSessionService);

  readonly open = signal(false);
  readonly messages = signal<AssistantChatMessage[]>([]);
  readonly sending = signal(false);

  private conversationId: string | null = null;
  private businessId: string | null = null;
  private nextId = 1;
  private pending?: Subscription;

  constructor() {
    effect(() => {
      const businessId = this.session.activeBusinessAccountId();
      untracked(() => {
        if (businessId !== this.businessId) this.reset();
      });
    });
  }

  toggle(): void {
    this.open.update((open) => !open);
  }

  close(): void {
    this.open.set(false);
  }

  send(text: string, presetId?: string): void {
    const message = text.trim();
    if (!message || this.sending()) return;

    const businessId = this.session.activeBusinessAccountId();
    if (businessId !== this.businessId) this.reset();

    this.push('user', [{ type: 'p', parts: [{ text: message }] }]);
    this.sending.set(true);
    this.pending = this.api
      .send(
        {
          message,
          ...(this.conversationId ? { conversationId: this.conversationId } : {}),
          ...(presetId ? { presetId } : {}),
        },
        businessId,
      )
      .pipe(finalize(() => this.sending.set(false)))
      .subscribe({
        next: (response) => {
          if (response.conversationId) this.conversationId = response.conversationId;
          this.push('assistant', parseAssistantText(response.reply));
        },
        error: (error: unknown) => {
          if (
            error instanceof HttpErrorResponse &&
            error.error?.error === 'ASSISTANT_CONVERSATION_FULL'
          ) {
            // La próxima pregunta abre una conversación nueva en el backend.
            this.conversationId = null;
          }
          this.push('assistant', [{ type: 'p', parts: [{ text: errorText(error) }] }], true);
        },
      });
  }

  /** Empieza de cero: vuelve al menú principal y olvida la conversación. */
  reset(): void {
    this.pending?.unsubscribe();
    this.pending = undefined;
    this.sending.set(false);
    this.messages.set([]);
    this.conversationId = null;
    this.businessId = this.session.activeBusinessAccountId();
  }

  private push(role: AssistantChatMessage['role'], blocks: AssistantBlock[], error = false): void {
    this.messages.update((messages) => [
      ...messages,
      { id: this.nextId++, role, blocks, ...(error ? { error } : {}) },
    ]);
  }
}

function errorText(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'No pude conectarme. Revisa tu internet e intenta de nuevo.';
    }
    if (error.status === 403) {
      return 'No tienes acceso a este negocio. Elige otro en "Negocio activo".';
    }
    const message = error.error?.message;
    if (typeof message === 'string' && [409, 429, 502, 503].includes(error.status)) {
      return message;
    }
  }
  return 'Zaira no pudo responder. Intenta de nuevo en un momento.';
}
