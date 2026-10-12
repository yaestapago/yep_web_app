import { Component, input as defineInput } from '@angular/core';

export type KpiTone = 'default' | 'success' | 'warning' | 'error';
export type KpiSize = 'md' | 'sm';

/**
 * Cifra clave (03-componentes · yep-kpi). Se usa sobre la página o dentro de una `yep-card`, nunca
 * envuelta en una tarjeta propia dentro de otra tarjeta (P1).
 *
 * ```html
 * <yep-kpi label="Total capturado" [value]="totalLabel()" hint="42 pagos" [emphasis]="true" />
 * <yep-kpi label="Pendientes" value="3" tone="warning" [loading]="loading()" />
 * ```
 *
 * - `value` llega ya formateado. Cifra en familia display 40/800 (celular 32) con `tabular-nums` (P9).
 * - `tone` colorea solo un punto junto a la etiqueta.
 * - `emphasis`: fondo `--kpi-emphasis-bg`; un solo KPI destacado por vista.
 * - `loading`: esqueleto en lugar de la cifra y la ayuda.
 */
@Component({
  selector: 'yep-kpi',
  templateUrl: './kpi.html',
  styleUrl: './kpi.scss',
})
export class Kpi {
  readonly label = defineInput.required<string>();
  readonly value = defineInput.required<string>();
  readonly hint = defineInput('');
  readonly tone = defineInput<KpiTone>('default');
  readonly loading = defineInput(false);
  readonly emphasis = defineInput(false);
  readonly size = defineInput<KpiSize>('md');
}
