import { Component, computed, input as defineInput, output } from '@angular/core';

export type ButtonType = 'button' | 'submit' | 'reset';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
/**
 * Tono de `secondary` y `ghost` (no afecta a `primary` ni a `danger`):
 * - `neutral`: tinta (por defecto).
 * - `danger`: texto y borde en `--color-error-strong` ("Rechazar", "Eliminar" dentro de un modal).
 * - `on-brand`: texto y borde en `--brand-on-ink`, para fondos `--brand-ink` (banner, plan destacado).
 */
export type ButtonTone = 'neutral' | 'danger' | 'on-brand';

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

  /** Tono efectivo: solo `secondary` y `ghost` admiten tono. */
  protected readonly appliedTone = computed<ButtonTone>(() => {
    const variant = this.variant();
    return variant === 'secondary' || variant === 'ghost' ? this.tone() : 'neutral';
  });

  onClick(event: MouseEvent): void {
    if (this.disabled() || this.loading()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.clicked.emit(event);
  }
}
