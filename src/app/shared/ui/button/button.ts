import { Component, computed, input as defineInput, output } from '@angular/core';

export type ButtonType = 'button' | 'submit' | 'reset';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
/**
 * Tono del botón según el fondo donde va (`danger` nunca lleva tono):
 * - `neutral`: tinta (por defecto).
 * - `danger` (solo `secondary` y `ghost`): texto y borde en `--color-error-strong` ("Rechazar",
 *   "Eliminar" dentro de un modal).
 * - `on-brand` (solo `secondary` y `ghost`): texto y borde en `--brand-on-ink`, para fondos
 *   `--brand-ink` (banner, plan destacado).
 * - `ink` (`primary`, `secondary` y `ghost`): para fondos de marca claros (`yep-banner tone="lime"`).
 *   `primary` va con fondo `--brand-ink` y texto `--brand-on-ink`; `secondary` y `ghost`, con texto
 *   y borde `--brand-ink`. Colores de marca fijos, iguales en claro y en oscuro.
 */
export type ButtonTone = 'neutral' | 'danger' | 'on-brand' | 'ink';

/** Tono efectivo de una combinación de variante y tono (ver `ButtonTone`). */
export function resolveButtonTone(variant: ButtonVariant, tone: ButtonTone): ButtonTone {
  if (variant === 'secondary' || variant === 'ghost') {
    return tone;
  }
  return variant === 'primary' && tone === 'ink' ? 'ink' : 'neutral';
}

/**
 * Botón de acción (03-componentes · yep-button). Para navegar, usa el enlace `a[yepButton]`
 * (`ButtonLink`), con los mismos `variant`, `size` y `tone`.
 */
@Component({
  selector: 'yep-button',
  host: {
    '[class.yep-button-host--full]': 'fullWidth()',
  },
  templateUrl: './button.html',
  styleUrl: './button.scss',
})
export class Button {
  readonly type = defineInput<ButtonType>('button');
  readonly variant = defineInput<ButtonVariant>('primary');
  readonly size = defineInput<ButtonSize>('md');
  readonly tone = defineInput<ButtonTone>('neutral');
  readonly disabled = defineInput(false);
  readonly loading = defineInput(false);
  readonly fullWidth = defineInput(false);
  readonly clicked = output<MouseEvent>();

  /** Tono efectivo: `secondary` y `ghost` admiten todos; `primary`, solo `ink`. */
  protected readonly appliedTone = computed(() => resolveButtonTone(this.variant(), this.tone()));

  onClick(event: MouseEvent): void {
    if (this.disabled() || this.loading()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.clicked.emit(event);
  }
}
