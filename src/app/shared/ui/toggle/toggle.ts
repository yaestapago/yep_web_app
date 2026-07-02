import { Component, input as defineInput, output } from '@angular/core';

type ToggleAppearance = 'switch' | 'button';

/**
 * Primitivo de toggle reutilizable en toda la plataforma.
 * - `appearance="switch"`: interruptor deslizante (on/off), reemplaza los `.switch`
 *   ad-hoc de Configuración y Notificadores.
 * - `appearance="button"`: píldora marcable/desmarcable, usada por los filtros de la
 *   grilla de horarios (empleados y sedes). Admite un slot `[toggleLead]` para un
 *   indicador (p. ej. el punto de color del empleado).
 *
 * No implementa ControlValueAccessor a propósito: se controla con `pressed` + `toggled`,
 * que encaja con estados que viven en signals fuera de un Reactive Form.
 */
@Component({
  selector: 'yep-toggle',
  templateUrl: './toggle.html',
  styleUrl: './toggle.scss',
})
export class Toggle {
  readonly appearance = defineInput<ToggleAppearance>('switch');
  readonly pressed = defineInput(false);
  readonly disabled = defineInput(false);
  readonly label = defineInput('');
  readonly ariaLabel = defineInput('');
  readonly dataCy = defineInput('');
  readonly toggled = output<boolean>();

  toggle(): void {
    if (this.disabled()) {
      return;
    }
    this.toggled.emit(!this.pressed());
  }
}
