import { Component, booleanAttribute, input as defineInput, output } from '@angular/core';
import { LucideCheck, LucideMinus } from '@lucide/angular';

let nextCheckGroupId = 0;

/**
 * Grupo con casilla padre y opciones hijas (03-componentes · yep-check-group). Para Alertas WhatsApp (R7)
 * y el modal de empleados. Va dentro de una tarjeta o de un modal, así que no lleva borde (P1).
 *
 * ```html
 * <yep-check-group
 *   label="Caja principal"
 *   meta="****9432 · Ahorros"
 *   count="2 de 2 llaves"
 *   [checked]="todas()"
 *   [indeterminate]="algunas()"
 *   (checkedChange)="toggleCuenta(cuenta, $event)"
 * >
 *   <yep-check-option label="Cuenta directa" meta="Sin llave Bre-B" [checked]="…" (checkedChange)="…" />
 *   <yep-button slot="actions" variant="ghost" size="sm">Deseleccionar todo</yep-button>
 * </yep-check-group>
 * ```
 *
 * Controlado: el estado lo decide la página con `checked`/`indeterminate`; el componente solo emite
 * `checkedChange` con el valor pedido (`true` si estaba indeterminado). Las hijas van en una rejilla de
 * 2 columnas (1 en celular); si no hay hijas, la rejilla no se dibuja.
 */
@Component({
  selector: 'yep-check-group',
  imports: [LucideCheck, LucideMinus],
  templateUrl: './check-group.html',
  styleUrl: './check-group.scss',
})
export class CheckGroup {
  readonly label = defineInput.required<string>();
  /** Línea secundaria en mono, p. ej. "****9432 · Ahorros". */
  readonly meta = defineInput('');
  /** Contador a la derecha, p. ej. "2 de 2 llaves". */
  readonly count = defineInput('');
  readonly checked = defineInput(false, { transform: booleanAttribute });
  readonly indeterminate = defineInput(false, { transform: booleanAttribute });
  readonly disabled = defineInput(false, { transform: booleanAttribute });
  readonly dataCy = defineInput('');

  readonly checkedChange = output<boolean>();

  protected readonly labelId = `yep-check-group-${nextCheckGroupId++}`;

  protected onChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Controlado: la casilla vuelve al estado de los inputs hasta que la página lo cambie.
    input.checked = this.checked();
    input.indeterminate = this.indeterminate();
    if (this.disabled()) {
      return;
    }
    this.checkedChange.emit(this.indeterminate() ? true : !this.checked());
  }
}
