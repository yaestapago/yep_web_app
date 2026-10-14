import { Component, ViewEncapsulation, booleanAttribute, input as defineInput } from '@angular/core';

export type TableDensity = 'compact' | 'comfortable';

/**
 * Estilo de tabla sobre una `<table>` nativa (P8 · 03-componentes · yep-table). No reinventa el marcado:
 * la pantalla escribe su `thead`/`tbody` y esta directiva solo pone las clases.
 *
 * ```html
 * <div class="yep-table-wrap">
 *   <table yepTable [stackOnMobile]="true" density="comfortable" [clickableRows]="true">
 *     <thead><tr><th>Cuenta</th><th class="num">Monto</th><th class="actions"></th></tr></thead>
 *     <tbody>
 *       <tr><td data-label="Cuenta">…</td><td data-label="Monto" class="num">…</td><td class="actions">…</td></tr>
 *     </tbody>
 *   </table>
 * </div>
 * ```
 *
 * - `.yep-table-wrap`: borde 1 px y radio `--radius-lg` (a sangre dentro de `yep-card padding="none"`) y
 *   scroll horizontal interno, nunca de la página.
 * - Celdas: `.num` (derecha, mono, `tabular-nums`) y `.actions` (derecha, ancho justo).
 * - `stackOnMobile` (por defecto): en ≤ 768 px cada fila es un bloque y cada celda muestra su `data-label`.
 * - Fila vacía: `<tr><td [attr.colspan]="n"><yep-state …/></td></tr>`.
 *
 * Es un componente con selector de atributo y sin encapsulación (como `table[mat-table]`) para que sus
 * estilos lleguen a las celdas proyectadas; todas las reglas están bajo `.yep-table` / `.yep-table-wrap`.
 */
@Component({
  selector: 'table[yepTable]',
  exportAs: 'yepTable',
  host: {
    class: 'yep-table',
    '[class.yep-table--compact]': "density() === 'compact'",
    '[class.yep-table--stack]': 'stackOnMobile()',
    '[class.yep-table--clickable]': 'clickableRows()',
  },
  template: '<ng-content></ng-content>',
  styleUrl: './table.scss',
  encapsulation: ViewEncapsulation.None,
})
export class Table {
  readonly density = defineInput<TableDensity>('comfortable');
  readonly stackOnMobile = defineInput(true, { transform: booleanAttribute });
  readonly clickableRows = defineInput(false, { transform: booleanAttribute });
}
