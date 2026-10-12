import { Component, input as defineInput } from '@angular/core';

export type StatusChipTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'live';
export type StatusChipSize = 'sm' | 'md';

/**
 * Chip de estado (03-componentes · yep-status-chip). Reemplaza a `routing-badge`, `code-chip` y a los
 * chips de rol y de estado de cada pantalla.
 *
 * ```html
 * <yep-status-chip tone="success" label="En línea" />
 * <yep-status-chip tone="live" label="Nuevo" size="md" />
 * ```
 *
 * `live` es lima (P4): un solo chip, banner o etiqueta lima por vista.
 */
@Component({
  selector: 'yep-status-chip',
  templateUrl: './status-chip.html',
  styleUrl: './status-chip.scss',
})
export class StatusChip {
  readonly tone = defineInput<StatusChipTone>('neutral');
  readonly label = defineInput.required<string>();
  readonly dot = defineInput(true);
  readonly size = defineInput<StatusChipSize>('sm');
}
