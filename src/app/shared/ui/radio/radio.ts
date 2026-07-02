import { Component, input as defineInput, output } from '@angular/core';

let nextRadioId = 0;

/**
 * Primitivo de radio único reutilizable para construir grupos de radios uniformes.
 * Controlado: `[checked]` + `[name]`/`[value]` + `(selected)`.
 *
 * Para listas ricas (tarjetas con icono/descripción/tabla) usa `yep-radio-selection-list`,
 * que ya centraliza ese patrón.
 */
@Component({
  selector: 'yep-radio',
  templateUrl: './radio.html',
  styleUrl: './radio.scss',
})
export class Radio {
  readonly id = defineInput(`yep-radio-${nextRadioId++}`);
  readonly name = defineInput('');
  readonly value = defineInput<string>('');
  readonly checked = defineInput(false);
  readonly disabled = defineInput(false);
  readonly label = defineInput('');
  readonly ariaLabel = defineInput('');
  readonly dataCy = defineInput('');
  readonly selected = output<string>();

  select(): void {
    if (this.disabled() || this.checked()) {
      return;
    }
    this.selected.emit(this.value());
  }
}
