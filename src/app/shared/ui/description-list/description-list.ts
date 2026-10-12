import { Component, input as defineInput } from '@angular/core';

export type DescriptionListColumns = 1 | 2 | 3;
export type DescriptionListLayout = 'stacked' | 'inline';

/**
 * Datos de lectura en lista (P2 · 03-componentes · yep-description-list). Va dentro de una sola tarjeta.
 *
 * ```html
 * <yep-description-list [columns]="3">
 *   <yep-description-item label="NIT" [mono]="true">902064229</yep-description-item>
 *   <yep-description-item label="Código" [copy]="shareCode()" (copied)="copyCode()">527109</yep-description-item>
 * </yep-description-list>
 * ```
 *
 * `stacked` (por defecto): etiqueta arriba, rejilla de `columns` columnas (1 en celular).
 * `inline`: etiqueta a la izquierda y valor a la derecha, filas con divisor (detalle de pago).
 */
@Component({
  selector: 'yep-description-list',
  host: {
    role: 'list',
    class: 'yep-description-list',
    '[class.yep-description-list--stacked]': "layout() === 'stacked'",
    '[class.yep-description-list--inline]': "layout() === 'inline'",
    '[style.--yep-dl-columns]': 'columns()',
  },
  template: '<ng-content></ng-content>',
  styleUrl: './description-list.scss',
})
export class DescriptionList {
  readonly columns = defineInput<DescriptionListColumns>(2);
  readonly layout = defineInput<DescriptionListLayout>('stacked');
}
