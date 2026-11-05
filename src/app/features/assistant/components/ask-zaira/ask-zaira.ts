import { Component, computed, inject, input, output } from '@angular/core';
import { LucideCircleHelp } from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { Button } from '../../../../shared/ui/button/button';
import type { AssistantPageKey } from '../../assistant-page';
import type { AssistantFocus } from '../../services/assistant-api.service';
import { AssistantChatService } from '../../services/assistant-chat.service';

/**
 * Botón "Preguntarle a Zaira" para cualquier pantalla: abre el chat con la pregunta.
 *
 * Desde un modal, cierra el modal en `(asked)`: los modales quedan por encima del chat.
 *
 * ```html
 * <app-ask-zaira
 *   question="¿Por qué quedó por revisar este pago?"
 *   [focus]="{ sourceEventId: event.id }"
 *   (asked)="close()"
 * />
 * ```
 */
@Component({
  selector: 'app-ask-zaira',
  imports: [Button, LucideCircleHelp],
  // Con `fullWidth` el botón ocupa lo que le dé el host: su texto en una barra de acciones y todo
  // el ancho en el pie de un modal en celular, igual que un `yep-button` puesto ahí directo.
  template: `
    @if (visible()) {
      <yep-button variant="ghost" size="sm" [fullWidth]="true" (clicked)="ask()">
        <svg lucideCircleHelp aria-hidden="true"></svg>
        {{ label() }}
      </yep-button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class AskZaira {
  private readonly chat = inject(AssistantChatService);
  private readonly session = inject(AuthSessionService);

  readonly question = input.required<string>();
  readonly label = input('Preguntarle a Zaira');
  readonly presetId = input<string>();
  readonly page = input<AssistantPageKey>();
  readonly focus = input<AssistantFocus>();
  /** `false`: deja la pregunta en el cuadro para que la persona la complete. */
  readonly autoSend = input(true);
  /** Con `autoSend` en `false`, dónde queda el cursor. */
  readonly cursor = input<number>();

  readonly asked = output<void>();

  /** El rol `support` no tiene a Zaira (ver `Shell.canShowAssistant`). */
  protected readonly visible = computed(() => !this.session.isSupportUser());

  protected ask(): void {
    this.asked.emit();
    this.chat.ask(this.question(), {
      presetId: this.presetId(),
      page: this.page(),
      focus: this.focus(),
      autoSend: this.autoSend(),
      cursor: this.cursor(),
    });
  }
}
