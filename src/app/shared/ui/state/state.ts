import { Component, computed, input as defineInput } from '@angular/core';
import { LucideCircleAlert, LucideInbox } from '@lucide/angular';

import { IconTile } from '../icon-tile/icon-tile';

export type StateKind = 'loading' | 'empty' | 'error';

/** Anchos de las barras de esqueleto, en ciclo, para que no se vean como un bloque. */
const SKELETON_WIDTHS = ['70%', '100%', '85%'];

/**
 * Estados de una vista que carga datos (P10 · 03-componentes · yep-state): cargando, vacío y error.
 * El estado "con datos" es la propia vista.
 *
 * ```html
 * <yep-state kind="loading" [rows]="4" />
 * <yep-state kind="empty" title="Sin solicitudes pendientes" description="Cuando alguien pida acceso aparecerá aquí.">
 *   <svg slot="icon" lucideInbox></svg>
 * </yep-state>
 * <yep-state kind="error" title="No pudimos cargar los pagos">
 *   <yep-button slot="action" variant="secondary" (clicked)="reload()">Reintentar</yep-button>
 * </yep-state>
 * ```
 *
 * - `loading`: barras de esqueleto `--color-surface-muted` con brillo de opacidad, no spinner.
 * - `empty` / `error`: icono Lucide 24 px en contenedor de 48 (`[slot=icon]`; si no se proyecta, `inbox`
 *   o `circle-alert`), título, descripción y `[slot=action]`.
 */
@Component({
  selector: 'yep-state',
  imports: [IconTile, LucideCircleAlert, LucideInbox],
  host: {
    // Evita que el input `title` deje un tooltip nativo sobre todo el bloque.
    '[attr.title]': 'null',
  },
  templateUrl: './state.html',
  styleUrl: './state.scss',
})
export class State {
  readonly kind = defineInput.required<StateKind>();
  readonly title = defineInput('');
  readonly description = defineInput('');
  readonly rows = defineInput(3);

  protected readonly skeletonRows = computed(() => {
    const count = Math.max(1, Math.floor(this.rows() || 0));
    return Array.from({ length: count }, (_, i) => SKELETON_WIDTHS[i % SKELETON_WIDTHS.length]);
  });
}
