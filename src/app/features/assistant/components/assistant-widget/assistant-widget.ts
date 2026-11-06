import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  LucideCheck,
  LucideChevronDown,
  LucideCircleAlert,
  LucideCopy,
  LucideInfo,
  LucideMessageCircle,
  LucideMinus,
  LucideRotateCcw,
  LucideRotateCw,
  LucideSendHorizontal,
  LucideThumbsDown,
  LucideThumbsUp,
  LucideX,
} from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { ButtonLink } from '../../../../shared/ui/button/button-link';
import { IconButton } from '../../../../shared/ui/icon-button/icon-button';
import { Modal } from '../../../../shared/ui/modal/modal';
import {
  ASSISTANT_PAGE_LABELS,
  AssistantPageKey,
  assistantPageFromUrl,
} from '../../assistant-page';
import { AssistantRouteAccess, assistantRouteFor } from '../../assistant-routes';
import { assistantWhatsappUrl, buildAssistantSupportText } from '../../assistant-support';
import { AssistantInline } from '../../assistant-text';
import {
  AssistantFollowUp,
  AssistantSuggestion,
  AssistantSuggestionSeverity,
} from '../../services/assistant-api.service';
import {
  AssistantChatMessage,
  AssistantChatService,
  AssistantMenuItem,
  assistantMenu,
} from '../../services/assistant-chat.service';
import { ZairaAvatar } from '../zaira-avatar/zaira-avatar';

/** Igual que el backend (`ASSISTANT_MESSAGE_MAX_LENGTH`). */
const MAX_MESSAGE_LENGTH = 1000;
/** Desde aquí se muestra cuánto falta: `maxlength` corta lo pegado sin avisar. */
const COUNTER_FROM_LENGTH = 900;
/** Día (`YYYY-MM-DD`) en que se cerró el saludo o se abrió el chat. */
const NUDGE_STORAGE_KEY = 'yep-zaira-nudge';
const NUDGE_DELAY_MS = 4000;
/** Presentación de Zaira: se muestra una sola vez por navegador (anuncio de lanzamiento). */
const INTRO_STORAGE_KEY = 'yep-zaira-intro-v1';
const INTRO_DELAY_MS = 1500;
const COPIED_VISIBLE_MS = 2000;
/** Mismo corte que `.assistant-panel` en el SCSS: ahí el panel tapa la pantalla. */
const PHONE_LAYOUT_QUERY = '(max-width: 768px)';
/** Pantalla táctil: abrir el teclado sin que lo pidan tapa las opciones del chat. */
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

const VOTE_REASONS: readonly string[] = ['No resolvió mi problema', 'Está mal', 'No lo entendí'];

const ALERT_VARIANTS: Record<AssistantSuggestionSeverity, 'error' | 'warning' | 'info'> = {
  critical: 'error',
  warn: 'warning',
  info: 'info',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function matchesMedia(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/**
 * Botón flotante y panel de chat con Zaira, la asistente virtual. Se monta una
 * vez en el shell; el estado vive en `AssistantChatService`.
 */
@Component({
  selector: 'app-assistant-widget',
  imports: [
    Alert,
    Button,
    ButtonLink,
    IconButton,
    Modal,
    NgTemplateOutlet,
    RouterLink,
    LucideCheck,
    LucideChevronDown,
    LucideCircleAlert,
    LucideCopy,
    LucideInfo,
    LucideMessageCircle,
    LucideRotateCw,
    LucideSendHorizontal,
    ZairaAvatar,
  ],
  templateUrl: './assistant-widget.html',
  styleUrl: './assistant-widget.scss',
})
export class AssistantWidget {
  protected readonly chat = inject(AssistantChatService);
  private readonly session = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly maxLength = MAX_MESSAGE_LENGTH;
  protected readonly voteReasons = VOTE_REASONS;
  protected readonly closeIcon = LucideX;
  protected readonly minimizeIcon = LucideMinus;
  protected readonly resetIcon = LucideRotateCcw;
  protected readonly thumbsUpIcon = LucideThumbsUp;
  protected readonly thumbsDownIcon = LucideThumbsDown;

  protected readonly menu = computed(() => assistantMenu(this.session.activeMembership()?.role));
  /** Menú de preguntas frecuentes reabierto en medio de una conversación. */
  protected readonly menuOpen = signal(false);
  /** Saludo junto al botón: una vez al día, hasta que lo cierren o abran el chat. */
  protected readonly nudgeVisible = signal(false);
  /** Presentación de lanzamiento ("Conoce a Zaira"), una sola vez. */
  protected readonly introOpen = signal(false);
  /** Dirección recién copiada, para confirmarlo junto a ella. */
  protected readonly copied = signal<string | null>(null);
  protected readonly firstName = computed(() => this.session.user()?.firstName?.trim() || null);
  protected readonly canSend = computed(
    () => !!this.chat.draft().trim() && !this.chat.busy() && !this.chat.budgetReached(),
  );
  protected readonly draftLength = computed(() => this.chat.draft().length);
  protected readonly showCounter = computed(() => this.draftLength() >= COUNTER_FROM_LENGTH);
  /**
   * Abre cada conversación. La gente creía estar hablando con Zaira Bayona, la persona de la
   * landing: por eso arranca diciendo que es un robot, y siempre ofrece a una persona por WhatsApp.
   */
  protected readonly greeting = computed(() => {
    const name = this.firstName();
    return `Hola${name ? `, ${name}` : ''}. Soy Zaira, un robot que responde preguntas sobre YEP. No soy una persona.`;
  });
  /** WhatsApp de soporte, para quien prefiera hablar con alguien del equipo. */
  protected readonly humanSupportUrl = assistantWhatsappUrl(
    'Hola, quiero hablar con una persona del equipo de YEP.',
  );
  /** Aviso urgente para el saludo. Un empleado no recibe alarmas del negocio por aquí. */
  protected readonly nudgeAlert = computed(() =>
    this.session.activeMembership()?.role === 'account_owner'
      ? (this.chat.suggestions().find((item) => item.severity === 'critical') ?? null)
      : null,
  );

  private readonly routeAccess = computed<AssistantRouteAccess>(() => {
    const membership = this.session.activeMembership();
    return {
      businessId: this.session.activeBusinessAccountId(),
      role: membership?.role,
      isSu: this.session.isSuperUser(),
      sectionAccess: membership?.sectionAccess,
    };
  });
  /** Solo cambia con un mensaje nuevo: un pulgar o un reintento habilitado no mueven el scroll. */
  private readonly lastMessage = computed(
    () => {
      const last = this.chat.messages().at(-1);
      return last ? { id: last.id, role: last.role } : null;
    },
    { equal: (a, b) => a?.id === b?.id },
  );

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly fab = viewChild<ElementRef<HTMLButtonElement>>('fab');

  constructor() {
    afterRenderEffect(() => {
      const last = this.lastMessage();
      const sending = this.chat.sending();
      const menuOpen = this.menuOpen();
      this.chat.progress();
      const log = this.log()?.nativeElement;
      if (log) this.placeScroll(log, last, sending, menuOpen);
    });

    afterRenderEffect(() => {
      this.chat.draft();
      const input = this.input()?.nativeElement;
      if (input) this.autoResize(input);
    });

    afterRenderEffect(() => {
      const request = this.chat.composerRequest();
      const input = this.input()?.nativeElement;
      if (!request || !input) return;
      untracked(() => this.chat.composerRequest.set(null));
      if (!request.force && matchesMedia(TOUCH_QUERY)) {
        this.panel()?.nativeElement.focus();
        return;
      }
      input.focus();
      if (request.cursor !== undefined) input.setSelectionRange(request.cursor, request.cursor);
    });

    // Una pregunta que llega desde otra pantalla cierra el menú, como una escrita aquí.
    effect(() => {
      if (this.chat.sending()) untracked(() => this.menuOpen.set(false));
    });

    effect(() => {
      if (!this.chat.menuRequest()) return;
      untracked(() => {
        this.menuOpen.set(true);
        this.chat.menuRequest.set(false);
      });
    });

    // La primera vez, la presentación reemplaza al saludo de ese día.
    if (!this.introSeen()) {
      const timer = setTimeout(() => {
        if (!this.chat.open()) this.introOpen.set(true);
      }, INTRO_DELAY_MS);
      this.destroyRef.onDestroy(() => clearTimeout(timer));
    } else if (!this.nudgeShownToday()) {
      // Antes del saludo, para que ya sepa si hay algo urgente.
      this.chat.loadSuggestions();
      const timer = setTimeout(() => {
        if (!this.chat.open()) this.nudgeVisible.set(true);
      }, NUDGE_DELAY_MS);
      this.destroyRef.onDestroy(() => clearTimeout(timer));
    }
  }

  protected closeIntro(): void {
    this.introOpen.set(false);
    this.remember(INTRO_STORAGE_KEY, today());
    this.remember(NUDGE_STORAGE_KEY, today());
  }

  /** "Pregúntale a Zaira" desde la presentación: abre el chat en el menú. */
  protected startFromIntro(): void {
    this.closeIntro();
    if (!this.chat.open()) this.chat.toggle();
    this.chat.requestComposerFocus();
  }

  protected toggle(): void {
    this.chat.toggle();
    if (this.chat.open()) {
      this.dismissNudge();
      this.chat.requestComposerFocus();
    } else {
      this.focusFab();
    }
  }

  protected dismissNudge(): void {
    this.nudgeVisible.set(false);
    this.remember(NUDGE_STORAGE_KEY, today());
  }

  /** Esconde el panel; la conversación sigue ahí al volver a abrirlo. */
  protected minimize(): void {
    this.chat.close();
    this.focusFab();
  }

  protected ask(item: AssistantMenuItem): void {
    this.menuOpen.set(false);
    this.chat.send(item.question, { presetId: item.presetId });
  }

  protected askFollowUp(followUp: AssistantFollowUp): void {
    this.chat.send(followUp.label, { presetId: followUp.presetId });
  }

  protected askSuggestion(suggestion: AssistantSuggestion): void {
    this.chat.send(suggestion.ask ?? (suggestion.title || suggestion.text), {
      presetId: suggestion.presetId,
      focus: suggestion.focus,
    });
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected newConversation(): void {
    this.chat.reset();
    this.chat.loadSuggestions();
    this.menuOpen.set(false);
    this.chat.requestComposerFocus();
  }

  protected onInput(event: Event): void {
    this.chat.draft.set((event.target as HTMLTextAreaElement).value);
  }

  /** Enter envía; Shift+Enter hace salto de línea. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.submit();
    }
  }

  protected submit(event?: Event): void {
    event?.preventDefault();
    if (!this.canSend()) return;
    this.menuOpen.set(false);
    const text = this.chat.draft();
    this.chat.draft.set('');
    this.chat.send(text);
  }

  protected trackPart(index: number, part: AssistantInline): string {
    return `${index}:${part.text}`;
  }

  protected alertVariant(severity: AssistantSuggestionSeverity): 'error' | 'warning' | 'info' {
    return ALERT_VARIANTS[severity];
  }

  /** Enlace a una pantalla, o `null` si esta persona no puede entrar. */
  protected linkFor(page: AssistantPageKey): readonly string[] | null {
    return assistantRouteFor(page, this.routeAccess());
  }

  /** En celular el panel tapa la pantalla: se minimiza. En escritorio sigue al lado de los pasos. */
  protected onInternalLink(): void {
    if (matchesMedia(PHONE_LAYOUT_QUERY)) this.chat.close();
  }

  protected showSupport(message: AssistantChatMessage): boolean {
    return Boolean(message.offerSupport || message.error || message.vote === 'down');
  }

  protected supportUrl(message: AssistantChatMessage): string {
    const page = assistantPageFromUrl(this.router.url);
    return assistantWhatsappUrl(
      message.supportText ??
        buildAssistantSupportText({
          name: this.firstName(),
          business: this.session.activeMembership()?.businessAccount?.name,
          question: this.chat.questionBefore(message.id),
          page: page ? ASSISTANT_PAGE_LABELS[page] : null,
          conversationId: message.conversationId ?? this.chat.conversationId(),
        }),
    );
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Sin permiso de portapapeles: la dirección sigue ahí para seleccionarla a mano.
      return;
    }
    this.copied.set(text);
    const timer = setTimeout(() => {
      if (this.copied() === text) this.copied.set(null);
    }, COPIED_VISIBLE_MS);
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }

  /**
   * La respuesta nueva se muestra desde su inicio: una guía larga no cabe en el panel y el
   * paso 1 quedaría arriba, fuera de la vista. Lo demás (pregunta, progreso, menú) va al final.
   */
  private placeScroll(
    log: HTMLElement,
    last: { id: number; role: string } | null,
    sending: boolean,
    menuOpen: boolean,
  ): void {
    if (!last) {
      log.scrollTop = 0;
      return;
    }
    const answer =
      !sending && !menuOpen && last.role === 'assistant'
        ? log.querySelector(`[data-message-id="${last.id}"]`)
        : null;
    if (!answer) {
      log.scrollTop = log.scrollHeight;
      return;
    }
    const offset = answer.getBoundingClientRect().top - log.getBoundingClientRect().top;
    log.scrollTop += offset - parseFloat(getComputedStyle(log).paddingTop || '0');
  }

  private autoResize(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  private nudgeShownToday(): boolean {
    return this.recall(NUDGE_STORAGE_KEY) === today();
  }

  private introSeen(): boolean {
    return this.recall(INTRO_STORAGE_KEY) !== null;
  }

  private recall(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      // Sin almacenamiento (modo privado): se trata como "visto" para no insistir.
      return key === INTRO_STORAGE_KEY ? 'sin-almacenamiento' : null;
    }
  }

  private remember(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Sin almacenamiento: no pasa nada, solo no se recuerda.
    }
  }

  private focusFab(): void {
    afterNextRender(() => this.fab()?.nativeElement.focus(), { injector: this.injector });
  }
}
