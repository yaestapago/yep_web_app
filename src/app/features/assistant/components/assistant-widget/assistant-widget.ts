import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  LucideChevronDown,
  LucideMinus,
  LucideRotateCcw,
  LucideSendHorizontal,
  LucideX,
} from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { Button } from '../../../../shared/ui/button/button';
import { IconButton } from '../../../../shared/ui/icon-button/icon-button';
import { Modal } from '../../../../shared/ui/modal/modal';
import { AssistantInline } from '../../assistant-text';
import {
  ASSISTANT_MENU,
  AssistantChatService,
  AssistantMenuItem,
} from '../../services/assistant-chat.service';
import { ZairaAvatar } from '../zaira-avatar/zaira-avatar';

/** Igual que el backend (`ASSISTANT_MESSAGE_MAX_LENGTH`). */
const MAX_MESSAGE_LENGTH = 1000;
/** Día (`YYYY-MM-DD`) en que se cerró el saludo o se abrió el chat. */
const NUDGE_STORAGE_KEY = 'yep-zaira-nudge';
const NUDGE_DELAY_MS = 4000;
/** Presentación de Zaira: se muestra una sola vez por navegador (anuncio de lanzamiento). */
const INTRO_STORAGE_KEY = 'yep-zaira-intro-v1';
const INTRO_DELAY_MS = 1500;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Botón flotante y panel de chat con Zaira, la asistente virtual. Se monta una
 * vez en el shell; el estado vive en `AssistantChatService`.
 */
@Component({
  selector: 'app-assistant-widget',
  imports: [
    Button,
    IconButton,
    Modal,
    NgTemplateOutlet,
    LucideChevronDown,
    LucideSendHorizontal,
    ZairaAvatar,
  ],
  templateUrl: './assistant-widget.html',
  styleUrl: './assistant-widget.scss',
})
export class AssistantWidget {
  protected readonly chat = inject(AssistantChatService);
  private readonly session = inject(AuthSessionService);

  protected readonly menu = ASSISTANT_MENU;
  protected readonly maxLength = MAX_MESSAGE_LENGTH;
  protected readonly closeIcon = LucideX;
  protected readonly minimizeIcon = LucideMinus;
  protected readonly resetIcon = LucideRotateCcw;
  protected readonly draft = signal('');
  /** Menú de preguntas frecuentes reabierto en medio de una conversación. */
  protected readonly menuOpen = signal(false);
  /** Saludo junto al botón: una vez al día, hasta que lo cierren o abran el chat. */
  protected readonly nudgeVisible = signal(false);
  /** Presentación de lanzamiento ("Conoce a Zaira"), una sola vez. */
  protected readonly introOpen = signal(false);
  protected readonly firstName = computed(() => this.session.user()?.firstName?.trim() || null);
  protected readonly canSend = computed(() => !!this.draft().trim() && !this.chat.sending());

  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');

  constructor() {
    // Al llegar un mensaje (o el "escribiendo…"), baja hasta el final.
    afterRenderEffect(() => {
      this.chat.messages();
      this.chat.sending();
      this.menuOpen();
      const log = this.log()?.nativeElement;
      if (log) log.scrollTop = log.scrollHeight;
    });

    // La primera vez, la presentación reemplaza al saludo de ese día.
    const destroyRef = inject(DestroyRef);
    if (!this.introSeen()) {
      const timer = setTimeout(() => {
        if (!this.chat.open()) this.introOpen.set(true);
      }, INTRO_DELAY_MS);
      destroyRef.onDestroy(() => clearTimeout(timer));
    } else if (!this.nudgeShownToday()) {
      const timer = setTimeout(() => {
        if (!this.chat.open()) this.nudgeVisible.set(true);
      }, NUDGE_DELAY_MS);
      destroyRef.onDestroy(() => clearTimeout(timer));
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
    this.focusInput();
  }

  protected toggle(): void {
    this.chat.toggle();
    if (this.chat.open()) {
      this.dismissNudge();
      this.focusInput();
    }
  }

  protected dismissNudge(): void {
    this.nudgeVisible.set(false);
    this.remember(NUDGE_STORAGE_KEY, today());
  }

  /** Esconde el panel; la conversación sigue ahí al volver a abrirlo. */
  protected minimize(): void {
    this.chat.close();
  }

  /** Cierra y termina la conversación: al volver a abrir, empieza en el menú. */
  protected closeConversation(): void {
    this.chat.close();
    this.chat.reset();
    this.menuOpen.set(false);
    this.draft.set('');
  }

  protected ask(item: AssistantMenuItem): void {
    this.menuOpen.set(false);
    this.chat.send(item.question, item.presetId);
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected newConversation(): void {
    this.chat.reset();
    this.menuOpen.set(false);
    this.draft.set('');
    this.focusInput();
  }

  protected onInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.draft.set(textarea.value);
    this.autoResize(textarea);
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
    this.chat.send(this.draft());
    this.draft.set('');
    const textarea = this.input()?.nativeElement;
    if (textarea) {
      textarea.value = '';
      this.autoResize(textarea);
    }
  }

  protected trackPart(index: number, part: AssistantInline): string {
    return `${index}:${part.text}`;
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

  private focusInput(): void {
    queueMicrotask(() => this.input()?.nativeElement.focus());
  }
}
