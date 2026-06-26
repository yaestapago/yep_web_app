import { Component, computed, input as defineInput } from '@angular/core';

import {
  type NotifierStatusLevel,
  notifierStatusLabel,
} from '../../utils/notifier-status';

/**
 * Indicador circular tipo semáforo. No depende solo del color: siempre
 * acompaña el punto con texto y un `aria-label` legible.
 */
@Component({
  selector: 'yep-status-dot',
  host: {
    role: 'status',
    '[attr.aria-label]': 'ariaLabel()',
    '[class]': '"yep-status yep-status--" + level()',
  },
  templateUrl: './status-dot.html',
  styleUrl: './status-dot.scss',
})
export class StatusDot {
  readonly level = defineInput.required<NotifierStatusLevel>();
  /** Etiqueta a mostrar; por defecto la del nivel. */
  readonly label = defineInput<string>('');
  /** Detalle opcional (p. ej. "hace 3 min") mostrado junto a la etiqueta. */
  readonly detail = defineInput<string>('');
  /** Oculta el texto y deja solo el punto (el aria-label se mantiene). */
  readonly compact = defineInput(false);

  readonly resolvedLabel = computed(() => this.label() || notifierStatusLabel(this.level()));
  readonly ariaLabel = computed(() => {
    const detail = this.detail();
    return detail ? `${this.resolvedLabel()} · ${detail}` : this.resolvedLabel();
  });
}
