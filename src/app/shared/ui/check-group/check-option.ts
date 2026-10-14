import { Component, booleanAttribute, input as defineInput, output } from '@angular/core';
import { LucideCheck } from '@lucide/angular';

/**
 * Opción hija de `yep-check-group` (03-componentes · yep-check-group). Fila de 40 px con casilla,
 * `label` 13/600 y `meta` 12 px, sin borde ni fondo propio.
 *
 * ```html
 * <yep-check-option label="0091806394" meta="Llave Bre-B" [checked]="…" (checkedChange)="…" />
 * ```
 *
 * Controlado: la página decide `checked`; el componente emite `checkedChange` con el valor pedido.
 */
@Component({
  selector: 'yep-check-option',
  imports: [LucideCheck],
  templateUrl: './check-option.html',
  styleUrl: './check-option.scss',
})
export class CheckOption {
  readonly label = defineInput.required<string>();
  readonly meta = defineInput('');
  readonly checked = defineInput(false, { transform: booleanAttribute });
  readonly disabled = defineInput(false, { transform: booleanAttribute });
  readonly dataCy = defineInput('');

  readonly checkedChange = output<boolean>();

  protected onChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Controlado: la casilla vuelve al estado del input hasta que la página lo cambie.
    input.checked = this.checked();
    if (this.disabled()) {
      return;
    }
    this.checkedChange.emit(!this.checked());
  }
}
