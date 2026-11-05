import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, TimeoutError, finalize, timeout } from 'rxjs';

import { AuthSessionService } from '../../../core/services/auth-session.service';
import type { BusinessMembershipRole } from '../../../shared/models/auth.models';
import { AssistantPageKey, assistantPageFromUrl, isAssistantPageKey } from '../assistant-page';
import {
  ASSISTANT_CONVERSATION_STORAGE_PREFIX,
  forgetAssistantConversations,
} from '../assistant-storage';
import { AssistantBlock, parseAssistantText, plainAssistantBlocks } from '../assistant-text';
import {
  AssistantAction,
  AssistantApiService,
  AssistantConversationResponse,
  AssistantFocus,
  AssistantFollowUp,
  AssistantMessageResponse,
  AssistantSuggestion,
  AssistantSuggestionSeverity,
  AssistantSuggestionsResponse,
  AssistantVote,
} from './assistant-api.service';

/** Plazo de la web para una respuesta. El backend corta antes; esto cubre un proxy colgado. */
const REPLY_DEADLINE_MS = 120_000;
const RESTORE_DEADLINE_MS = 8_000;
const PROGRESS_STILL_MS = 8_000;
const PROGRESS_SLOW_MS = 25_000;
const PROGRESS_STILL_TEXT = 'Sigo revisando…';
const PROGRESS_SLOW_TEXT = 'Esto está tardando más de lo normal.';
const SUGGESTIONS_MAX = 3;
const SUGGESTIONS_TTL_MS = 2 * 60_000;
const MAX_ACTIONS = 2;
const MAX_FOLLOW_UPS = 3;
const CONVERSATION_TTL_MS = 24 * 60 * 60_000;
/** La misma entrada otra vez en este tiempo es un doble clic, aunque ya haya llegado la respuesta. */
const DOUBLE_CLICK_MS = 1000;

export interface AssistantAskOptions {
  /** Pantalla de la pregunta. Sin ella se usa la que esté abierta. */
  page?: AssistantPageKey;
  /** Pago o notificador del que se está hablando (lo valida el backend con sus permisos). */
  focus?: AssistantFocus;
  /** Guía del backend: se responde al instante y sin gastar el tope. */
  presetId?: string;
  /** `false`: deja la pregunta en el cuadro de texto para que la persona la complete. */
  autoSend?: boolean;
  /** Con `autoSend: false`, dónde queda el cursor. */
  cursor?: number;
}

/** Lo necesario para volver a mandar una pregunta. */
export interface AssistantOutgoing {
  text: string;
  presetId?: string;
  page?: AssistantPageKey;
  focus?: AssistantFocus;
}

export interface AssistantChatMessage {
  id: number;
  role: 'user' | 'assistant';
  blocks: AssistantBlock[];
  /** Solo en mensajes del usuario: lo que escribió, para el mensaje a soporte. */
  text?: string;
  /** Mensaje de error de la web (no lo escribió Zaira). */
  error?: boolean;
  retry?: AssistantOutgoing;
  /** Aviso mientras no se puede reintentar (límite de ráfaga). */
  retryWait?: string;
  /** Conversación llena: la pregunta pasa a una conversación nueva. */
  restartQuestion?: string;
  turn?: number;
  conversationId?: string;
  actions?: AssistantAction[];
  followUps?: AssistantFollowUp[];
  offerSupport?: boolean;
  supportText?: string;
  vote?: AssistantVote;
  voteComment?: string;
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

const OWNER_MENU: readonly AssistantMenuItem[] = [
  { question: '¿Por qué no me llegó un pago?' },
  { question: '¿Por qué se están demorando mis notificaciones?' },
  { question: '¿Cómo configuro los correos para que funcionen?', presetId: 'configurar-correos' },
  { question: '¿Cómo agrego un notificador?', presetId: 'agregar-notificador' },
  { question: '¿Cómo recibo alertas de WhatsApp?', presetId: 'alertas-whatsapp' },
  { question: '¿Cómo agrego empleados y cómo los configuro?', presetId: 'configurar-empleados' },
  { question: '¿Cuáles son los precios?', presetId: 'precios' },
  { question: '¿Ustedes acceden a mi cuenta bancaria?', presetId: 'acceso-banco' },
];

/** Un empleado no configura notificadores ni ve el plan: no se le ofrece lo que no puede usar. */
const STAFF_MENU: readonly AssistantMenuItem[] = [
  { question: '¿Por qué no veo un pago?' },
  { question: '¿Qué puedo ver en YEP?' },
  { question: '¿Cómo recibo alertas de WhatsApp?', presetId: 'alertas-whatsapp' },
  { question: '¿Ustedes acceden a mi cuenta bancaria?', presetId: 'acceso-banco' },
];

/** Las preguntas frecuentes que se ofrecen en el chat, según quién pregunta. */
export function assistantMenu(
  role: BusinessMembershipRole | null | undefined,
): readonly AssistantMenuItem[] {
  return role === 'account_staff' ? STAFF_MENU : OWNER_MENU;
}

/**
 * Estado del chat con Zaira. Vive en `root` para que la conversación siga
 * abierta al navegar entre páginas; se reinicia al cambiar de negocio activo
 * (cada conversación pertenece a un solo negocio) y de usuario: `root` sobrevive
 * al cierre de sesión, porque cerrar sesión no recarga la página.
 */
@Injectable({ providedIn: 'root' })
export class AssistantChatService {
  private readonly api = inject(AssistantApiService);
  private readonly session = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly open = signal(false);
  readonly messages = signal<AssistantChatMessage[]>([]);
  readonly sending = signal(false);
  /** Trayendo la conversación guardada: las preguntas esperan a que termine. */
  readonly restoring = signal(false);
  readonly busy = computed(() => this.sending() || this.restoring());
  /** Lo escrito en el cuadro. Vive aquí para no perderlo al minimizar. */
  readonly draft = signal('');
  /** Qué está revisando Zaira: del stream o, sin él, un texto por tiempo. */
  readonly progress = signal<string | null>(null);
  readonly suggestions = signal<AssistantSuggestion[]>([]);
  readonly budgetReached = signal(false);
  readonly conversationId = signal<string | null>(null);
  /** Pedido de llevar el foco al cuadro; lo atiende el widget y lo limpia. */
  readonly composerRequest = signal<{ force?: boolean; cursor?: number } | null>(null);
  /** Pedido de mostrar las preguntas frecuentes; lo atiende el widget y lo limpia. */
  readonly menuRequest = signal(false);

  private businessId: string | null = null;
  private userId: string | null = this.session.user()?.id ?? null;
  private nextId = 1;
  private pending?: Subscription;
  private restoreRequest?: Subscription;
  private suggestionsRequest?: Subscription;
  private restoreTried = false;
  private suggestionsAt = 0;
  /** Preguntas que llegaron mientras se restauraba o se esperaba otra respuesta, en orden. */
  private queue: AssistantOutgoing[] = [];
  /** La pregunta que se está respondiendo. */
  private inFlight: AssistantOutgoing | null = null;
  private lastAsk: { outgoing: AssistantOutgoing; at: number } | null = null;
  private progressTimers: ReturnType<typeof setTimeout>[] = [];
  private retryTimers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    effect(() => {
      this.session.user();
      this.session.activeBusinessAccountId();
      untracked(() => this.syncSession());
    });
  }

  toggle(): void {
    if (this.open()) {
      this.close();
    } else {
      this.open.set(true);
      this.prepareOnOpen();
    }
  }

  close(): void {
    this.open.set(false);
  }

  /**
   * Abre a Zaira con una pregunta desde cualquier pantalla. Si está en medio de otra
   * respuesta, la pregunta espera su turno; si es esa misma, se ignora (doble clic). Quien la
   * llama desde un modal debe cerrarlo antes: los modales quedan por encima del chat.
   */
  ask(question: string, options: AssistantAskOptions = {}): void {
    this.open.set(true);
    this.prepareOnOpen();

    const text = question.trim();
    if (text && options.autoSend === false) {
      this.prefillDraft(question, options.cursor);
      return;
    }
    this.requestComposerFocus();
    if (!text) return;

    const outgoing = this.outgoing(text, options);
    if (this.isRepeatedAsk(outgoing)) return;
    this.lastAsk = { outgoing, at: Date.now() };
    if (this.busy()) {
      this.enqueue(outgoing);
      return;
    }
    this.pushQuestion(outgoing);
  }

  send(text: string, options: Pick<AssistantAskOptions, 'presetId' | 'page' | 'focus'> = {}): void {
    const message = text.trim();
    if (!message || this.sending()) return;

    this.syncSession();
    const outgoing = this.outgoing(message, options);
    if (this.restoring()) {
      this.enqueue(outgoing);
      return;
    }
    this.pushQuestion(outgoing);
  }

  /** Vuelve a mandar la pregunta que falló, sin repetirla en pantalla. */
  retry(messageId: number): void {
    this.syncSession();
    if (this.busy()) return;
    const message = this.messages().find((item) => item.id === messageId);
    if (!message?.retry || message.retryWait) return;
    this.messages.update((messages) => messages.filter((item) => item.id !== messageId));
    this.dispatch(message.retry);
  }

  /** Conversación llena: empieza una nueva con la misma pregunta lista en el cuadro. */
  startOver(messageId: number): void {
    const question = this.messages().find((item) => item.id === messageId)?.restartQuestion;
    this.reset();
    if (question) {
      this.draft.set(question);
      this.requestComposerFocus({ force: true });
    }
  }

  /** Empieza de cero: vuelve al menú principal y olvida la conversación. */
  reset(): void {
    this.forgetConversation();
    this.clearConversation();
    this.restoreTried = true;
  }

  requestComposerFocus(request: { force?: boolean; cursor?: number } = {}): void {
    this.composerRequest.set(request);
  }

  /** Pregunta que originó una respuesta, para el mensaje a soporte. */
  questionBefore(messageId: number): string | null {
    const messages = this.messages();
    const index = messages.findIndex((item) => item.id === messageId);
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].text ?? null;
    }
    return null;
  }

  /** Pulgar de una respuesta. Si no se puede guardar, el pulgar vuelve a quedar disponible. */
  vote(messageId: number, value: AssistantVote): void {
    const message = this.messages().find((item) => item.id === messageId);
    if (!message?.turn || !message.conversationId || message.vote === value) return;

    const { vote: previous, voteComment: previousComment } = message;
    this.patchMessage(messageId, { vote: value, voteComment: undefined });
    this.api
      .feedback(
        { conversationId: message.conversationId, turn: message.turn, value },
        this.businessId,
      )
      .subscribe({
        error: () => this.patchMessage(messageId, { vote: previous, voteComment: previousComment }),
      });
  }

  /** Motivo de un pulgar abajo. */
  comment(messageId: number, comment: string): void {
    const message = this.messages().find((item) => item.id === messageId);
    if (!message?.turn || !message.conversationId || !message.vote) return;

    this.patchMessage(messageId, { voteComment: comment });
    this.api
      .feedback(
        {
          conversationId: message.conversationId,
          turn: message.turn,
          value: message.vote,
          comment,
        },
        this.businessId,
      )
      .subscribe({ error: () => this.patchMessage(messageId, { voteComment: undefined }) });
  }

  /** Avisos según el estado del negocio. Si fallan, queda el menú de siempre, sin error. */
  loadSuggestions(): void {
    this.syncSession();
    if (!this.businessId || this.suggestionsRequest) return;
    if (Date.now() - this.suggestionsAt < SUGGESTIONS_TTL_MS) return;

    this.suggestionsRequest = this.api
      .suggestions(this.businessId)
      .pipe(
        finalize(() => {
          this.suggestionsRequest = undefined;
          this.suggestionsAt = Date.now();
        }),
      )
      .subscribe({
        next: (response) => this.suggestions.set(normalizeSuggestions(response)),
        error: () => undefined,
      });
  }

  private prepareOnOpen(): void {
    this.syncSession();
    this.restoreConversation();
    this.loadSuggestions();
  }

  /**
   * Compara también el usuario: entre dos personas sin negocio activo (onboarding, superadmin) el
   * negocio pasa de nada a nada, y la segunda vería la conversación de la primera.
   */
  private syncSession(): void {
    const userId = this.session.user()?.id ?? null;
    const businessId = this.session.activeBusinessAccountId();
    const userChanged = userId !== this.userId;
    if (!userChanged && businessId === this.businessId) return;

    this.suggestionsRequest?.unsubscribe();
    this.suggestions.set([]);
    this.suggestionsAt = 0;
    this.clearConversation();
    this.userId = userId;
    this.businessId = businessId;
    this.restoreTried = false;
    if (userChanged) {
      // El panel no se queda abierto para el siguiente, ni nada guardado de la otra persona.
      this.open.set(false);
      forgetAssistantConversations();
      return;
    }
    // Con el panel abierto, se retoma la conversación del negocio al que acaba de pasar.
    if (this.open()) this.prepareOnOpen();
  }

  /** Deja la pregunta en el cuadro para que la persona la complete. */
  private prefillDraft(question: string, cursor: number | undefined): void {
    // Con el tope agotado el cuadro está apagado: lo que sí puede usar son las preguntas frecuentes.
    if (this.budgetReached()) {
      this.menuRequest.set(true);
      return;
    }
    // Lo que venía escribiendo no se pisa: no hay forma de recuperarlo.
    const current = this.draft();
    if (current.trim() && current !== question) {
      this.requestComposerFocus({ force: true });
      return;
    }
    this.draft.set(question);
    this.requestComposerFocus({ force: true, cursor });
  }

  private isRepeatedAsk(outgoing: AssistantOutgoing): boolean {
    const recent = this.lastAsk;
    return (
      (recent !== null &&
        Date.now() - recent.at < DOUBLE_CLICK_MS &&
        isSameQuestion(recent.outgoing, outgoing)) ||
      (this.inFlight !== null && isSameQuestion(this.inFlight, outgoing)) ||
      this.queue.some((item) => isSameQuestion(item, outgoing))
    );
  }

  private enqueue(outgoing: AssistantOutgoing): void {
    if (!this.queue.some((item) => isSameQuestion(item, outgoing))) this.queue.push(outgoing);
  }

  private clearConversation(): void {
    this.queue = [];
    this.lastAsk = null;
    this.pending?.unsubscribe();
    this.pending = undefined;
    this.inFlight = null;
    this.restoreRequest?.unsubscribe();
    this.restoreRequest = undefined;
    this.restoring.set(false);
    this.sending.set(false);
    this.stopProgress();
    this.retryTimers.forEach(clearTimeout);
    this.retryTimers = [];
    this.messages.set([]);
    this.conversationId.set(null);
    this.budgetReached.set(false);
    this.draft.set('');
  }

  private outgoing(
    text: string,
    options: Pick<AssistantAskOptions, 'presetId' | 'page' | 'focus'>,
  ): AssistantOutgoing {
    const focus = cleanFocus(options.focus);
    const page = options.page ?? assistantPageFromUrl(this.router.url);
    return {
      text,
      ...(options.presetId ? { presetId: options.presetId } : {}),
      ...(page ? { page } : {}),
      ...(focus ? { focus } : {}),
    };
  }

  private pushQuestion(outgoing: AssistantOutgoing): void {
    this.pushMessage({
      role: 'user',
      blocks: plainAssistantBlocks(outgoing.text),
      text: outgoing.text,
    });
    this.dispatch(outgoing);
  }

  private dispatch(outgoing: AssistantOutgoing): void {
    const conversationId = this.conversationId();
    this.inFlight = outgoing;
    this.sending.set(true);
    this.startProgress();
    this.pending = this.api
      .sendWithProgress(
        {
          message: outgoing.text,
          ...(conversationId ? { conversationId } : {}),
          ...(outgoing.presetId ? { presetId: outgoing.presetId } : {}),
          ...(outgoing.page ? { page: outgoing.page } : {}),
          ...(outgoing.focus ? { focus: outgoing.focus } : {}),
        },
        this.businessId,
        (label) => this.showStatus(label),
      )
      .pipe(
        timeout({ first: REPLY_DEADLINE_MS }),
        finalize(() => {
          this.inFlight = null;
          this.sending.set(false);
          this.stopProgress();
          this.pending = undefined;
          this.flushQueued();
        }),
      )
      .subscribe({
        next: (response) => this.receiveReply(response, outgoing),
        error: (error: unknown) => this.receiveFailure(error, outgoing),
      });
  }

  private receiveReply(response: AssistantMessageResponse, outgoing: AssistantOutgoing): void {
    if (typeof response?.reply !== 'string') {
      this.receiveFailure(new Error('Respuesta sin texto'), outgoing);
      return;
    }
    if (response.conversationId) {
      this.conversationId.set(response.conversationId);
      this.saveConversation(response.conversationId);
    }
    if (response.kind === 'budget_reached') this.budgetReached.set(true);

    const conversationId = this.conversationId();
    const actions = normalizeActions(response.actions);
    const followUps = normalizeFollowUps(response.followUps);
    this.pushMessage({
      role: 'assistant',
      blocks: parseAssistantText(response.reply),
      ...(typeof response.turn === 'number' && conversationId
        ? { turn: response.turn, conversationId }
        : {}),
      ...(actions.length ? { actions } : {}),
      ...(followUps.length ? { followUps } : {}),
      ...(response.offerSupport ? { offerSupport: true } : {}),
      ...(typeof response.supportText === 'string' && response.supportText
        ? { supportText: response.supportText }
        : {}),
    });
  }

  private receiveFailure(error: unknown, outgoing: AssistantOutgoing): void {
    const failure = describeFailure(error);
    if (failure.conversationFull) {
      // La próxima pregunta abre una conversación nueva en el backend.
      this.conversationId.set(null);
      this.forgetConversation();
    }
    const id = this.pushMessage({
      role: 'assistant',
      blocks: parseAssistantText(failure.text),
      error: true,
      ...(failure.conversationFull
        ? { restartQuestion: outgoing.text }
        : failure.retryable
          ? { retry: outgoing }
          : {}),
      ...(failure.retryAfterSeconds ? { retryWait: retryWaitText(failure.retryAfterSeconds) } : {}),
    });
    if (failure.retryAfterSeconds) {
      this.retryTimers.push(
        setTimeout(
          () => this.patchMessage(id, { retryWait: undefined }),
          failure.retryAfterSeconds * 1000,
        ),
      );
    }
  }

  private pushMessage(message: Omit<AssistantChatMessage, 'id'>): number {
    const id = this.nextId++;
    this.messages.update((messages) => [...messages, { id, ...message }]);
    return id;
  }

  private patchMessage(id: number, patch: Partial<AssistantChatMessage>): void {
    this.messages.update((messages) =>
      messages.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  private flushQueued(): void {
    if (this.busy()) return;
    const next = this.queue.shift();
    if (next) this.pushQuestion(next);
  }

  /* Progreso: sin stream, textos por tiempo que no afirman nada; un estado real los reemplaza. */

  private startProgress(): void {
    this.stopProgress();
    this.progressTimers = [
      setTimeout(() => this.progress.set(PROGRESS_STILL_TEXT), PROGRESS_STILL_MS),
      setTimeout(() => this.progress.set(PROGRESS_SLOW_TEXT), PROGRESS_SLOW_MS),
    ];
  }

  private showStatus(label: string): void {
    this.stopProgress();
    this.progress.set(label);
    this.progressTimers = [
      setTimeout(() => this.progress.set(PROGRESS_SLOW_TEXT), PROGRESS_SLOW_MS),
    ];
  }

  private stopProgress(): void {
    this.progressTimers.forEach(clearTimeout);
    this.progressTimers = [];
    this.progress.set(null);
  }

  /* Retomar la conversación al recargar. El almacenamiento puede fallar (modo privado). */

  private restoreConversation(): void {
    if (this.restoreTried || this.conversationId() || this.messages().length) return;
    this.restoreTried = true;

    const saved = this.readSavedConversation();
    if (!saved) return;

    this.restoring.set(true);
    this.restoreRequest = this.api
      .conversation(saved, this.businessId)
      .pipe(timeout({ first: RESTORE_DEADLINE_MS }))
      .subscribe({
        next: (response) => {
          this.applyRestored(saved, response);
          this.finishRestore();
        },
        error: (error: unknown) => {
          // De otra persona, de otro negocio o ya vencida. Un corte de red no borra nada.
          if (error instanceof HttpErrorResponse && [400, 403, 404].includes(error.status)) {
            this.forgetConversation();
          }
          this.finishRestore();
        },
      });
  }

  private finishRestore(): void {
    this.restoreRequest = undefined;
    this.restoring.set(false);
    this.flushQueued();
  }

  private applyRestored(id: string, response: AssistantConversationResponse): void {
    const turns = Array.isArray(response?.turns) ? response.turns : [];
    const messages = turns.flatMap((turn): AssistantChatMessage[] => {
      if (typeof turn?.text !== 'string' || !turn.text.trim()) return [];
      if (turn.role === 'user') {
        return [
          {
            id: this.nextId++,
            role: 'user',
            blocks: plainAssistantBlocks(turn.text),
            text: turn.text,
          },
        ];
      }
      return turn.role === 'assistant'
        ? [
            {
              id: this.nextId++,
              role: 'assistant',
              blocks: parseAssistantText(turn.text),
              // Sin turno (backend viejo) no hay nada que calificar.
              ...(typeof turn.turn === 'number' && turn.turn > 0
                ? { turn: turn.turn, conversationId: id }
                : {}),
            },
          ]
        : [];
    });
    if (!messages.length) {
      this.forgetConversation();
      return;
    }
    this.conversationId.set(id);
    this.messages.set(messages);
  }

  private storageKey(): string | null {
    if (!this.businessId) return null;
    const userId = this.session.user()?.id ?? 'sin-usuario';
    return `${ASSISTANT_CONVERSATION_STORAGE_PREFIX}:${userId}:${this.businessId}`;
  }

  private saveConversation(id: string): void {
    const key = this.storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ id, at: Date.now() }));
    } catch {
      // Sin almacenamiento: al recargar empieza una conversación nueva.
    }
  }

  private readSavedConversation(): string | null {
    const key = this.storageKey();
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const saved = JSON.parse(raw) as { id?: unknown; at?: unknown };
      if (
        typeof saved?.id === 'string' &&
        typeof saved.at === 'number' &&
        Date.now() - saved.at < CONVERSATION_TTL_MS
      ) {
        return saved.id;
      }
      localStorage.removeItem(key);
    } catch {
      // Sin almacenamiento o con un valor dañado: se trata como si no hubiera nada.
    }
    return null;
  }

  private forgetConversation(): void {
    const key = this.storageKey();
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Sin almacenamiento: no hay nada que olvidar.
    }
  }
}

interface AssistantFailure {
  text: string;
  retryable: boolean;
  conversationFull?: boolean;
  retryAfterSeconds?: number;
}

function describeFailure(error: unknown): AssistantFailure {
  const generic = 'Zaira no pudo responder. Intenta de nuevo en un momento.';
  if (error instanceof TimeoutError) {
    return { text: 'Zaira se demoró demasiado. Intenta de nuevo.', retryable: true };
  }
  if (!(error instanceof HttpErrorResponse)) return { text: generic, retryable: true };

  if (error.status === 0) {
    return { text: 'No pude conectarme. Revisa tu internet e intenta de nuevo.', retryable: true };
  }
  if (error.status === 403) {
    return {
      text: 'No tienes acceso a este negocio. Elige otro en "Negocio activo".',
      retryable: false,
    };
  }
  const message = error.error?.message;
  const known =
    typeof message === 'string' &&
    message &&
    ([409, 429].includes(error.status) ||
      // De un 5xx solo lo que escribió Zaira. El mismo 503 lo usa el filtro de base de datos,
      // y a un comerciante no se le habla de eso ni se le confirma qué hay por dentro.
      ([502, 503].includes(error.status) && message.includes('Zaira')));
  const seconds = Number(error.error?.retryAfterSeconds);
  return {
    text: known ? message : generic,
    retryable: error.status !== 400,
    ...(error.error?.error === 'ASSISTANT_CONVERSATION_FULL' ? { conversationFull: true } : {}),
    ...(seconds > 0 ? { retryAfterSeconds: Math.ceil(seconds) } : {}),
  };
}

function retryWaitText(seconds: number): string {
  if (seconds < 60) return `Puedes intentar en ${seconds} s.`;
  if (seconds < 3600) return `Puedes intentar en ${Math.ceil(seconds / 60)} min.`;
  return `Puedes intentar en ${Math.ceil(seconds / 3600)} h.`;
}

function isSameQuestion(a: AssistantOutgoing, b: AssistantOutgoing): boolean {
  return (
    a.text === b.text &&
    a.presetId === b.presetId &&
    a.focus?.sourceEventId === b.focus?.sourceEventId &&
    a.focus?.notifierId === b.focus?.notifierId
  );
}

function cleanFocus(focus: AssistantFocus | undefined): AssistantFocus | undefined {
  if (!focus?.sourceEventId && !focus?.notifierId) return undefined;
  return {
    ...(focus.sourceEventId ? { sourceEventId: focus.sourceEventId } : {}),
    ...(focus.notifierId ? { notifierId: focus.notifierId } : {}),
  };
}

function normalizeAction(action: AssistantAction | undefined): AssistantAction | null {
  return action?.type === 'open_route' &&
    typeof action.label === 'string' &&
    isAssistantPageKey(action.route)
    ? action
    : null;
}

function normalizeActions(actions: AssistantAction[] | undefined): AssistantAction[] {
  if (!Array.isArray(actions)) return [];
  return actions
    .map(normalizeAction)
    .filter((action): action is AssistantAction => action !== null)
    .slice(0, MAX_ACTIONS);
}

function normalizeFollowUps(followUps: AssistantFollowUp[] | undefined): AssistantFollowUp[] {
  if (!Array.isArray(followUps)) return [];
  return followUps
    .filter((followUp) => typeof followUp?.label === 'string' && followUp.label.trim())
    .slice(0, MAX_FOLLOW_UPS);
}

function normalizeSeverity(severity: unknown): AssistantSuggestionSeverity {
  if (severity === 'critical') return 'critical';
  return severity === 'warn' || severity === 'warning' ? 'warn' : 'info';
}

function normalizeSuggestions(response: AssistantSuggestionsResponse): AssistantSuggestion[] {
  if (!Array.isArray(response?.suggestions)) return [];
  return response.suggestions
    .filter((item) => typeof item?.id === 'string' && typeof item.text === 'string')
    .slice(0, SUGGESTIONS_MAX)
    .map((item) => {
      const focus = cleanFocus(item.focus);
      const action = normalizeAction(item.action);
      return {
        id: item.id,
        title: typeof item.title === 'string' ? item.title : '',
        text: item.text,
        severity: normalizeSeverity(item.severity),
        ...(typeof item.ask === 'string' && item.ask ? { ask: item.ask } : {}),
        ...(typeof item.presetId === 'string' && item.presetId ? { presetId: item.presetId } : {}),
        ...(focus ? { focus } : {}),
        ...(action ? { action } : {}),
      };
    });
}
