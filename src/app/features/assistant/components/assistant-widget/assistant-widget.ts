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
import { LucideRotateCcw, LucideSendHorizontal, LucideX } from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { IconButton } from '../../../../shared/ui/icon-button/icon-button';
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Botón flotante y panel de chat con Zaira, la asistente virtual. Se monta una
 * vez en el shell; el estado vive en `AssistantChatService`.
 */
@Component({
  selector: 'app-assistant-widget',
  imports: [IconButton, NgTemplateOutlet, LucideSendHorizontal, LucideX, ZairaAvatar],
  templateUrl: './assistant-widget.html',
  styleUrl: './assistant-widget.scss',
})
export class AssistantWidget {
  protected readonly chat = inject(AssistantChatService);
  private readonly session = inject(AuthSessionService);

  protected readonly menu = ASSISTANT_MENU;
  protected readonly maxLength = MAX_MESSAGE_LENGTH;
  protected readonly closeIcon = LucideX;
  protected readonly resetIcon = LucideRotateCcw;
  protected readonly draft = signal('');
  /** Menú de preguntas frecuentes reabierto en medio de una conversación. */
  protected readonly menuOpen = signal(false);
  /** Saludo junto al botón: una vez al día, hasta que lo cierren o abran el chat. */
  protected readonly nudgeVisible = signal(false);
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

    if (!this.nudgeShownToday()) {
      const timer = setTimeout(() => {
        if (!this.chat.open()) this.nudgeVisible.set(true);
      }, NUDGE_DELAY_MS);
      inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    }
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
    try {
      localStorage.setItem(NUDGE_STORAGE_KEY, today());
    } catch {
      // Sin almacenamiento (modo privado): el saludo vuelve en la próxima visita.
    }
  }

  protected close(): void {
    this.chat.close();
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
    try {
      return localStorage.getItem(NUDGE_STORAGE_KEY) === today();
    } catch {
      return false;
    }
  }

  private focusInput(): void {
    queueMicrotask(() => this.input()?.nativeElement.focus());
  }
}
