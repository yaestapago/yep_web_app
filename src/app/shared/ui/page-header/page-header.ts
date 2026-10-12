import { Component, input as defineInput } from '@angular/core';

/**
 * Encabezado de toda página de cliente (03-componentes · yep-page-header).
 *
 * ```html
 * <yep-page-header title="Panadería La Espiga" subtitle="Bucaramanga · Santander">
 *   <a slot="back" routerLink="/business"><svg lucideArrowLeft></svg>Negocios</a>
 *   <yep-avatar slot="leading" name="La Espiga" [size]="48" />
 *   <yep-status-chip slot="meta" label="Propietario" />
 *   <yep-button slot="actions" variant="secondary">Editar</yep-button>
 * </yep-page-header>
 * ```
 *
 * Slots: `[slot=back]` (sustituye al `eyebrow`), `[slot=leading]`, `[slot=meta]`, `[slot=actions]`.
 * Deja 24 px de separación con el contenido que sigue.
 */
@Component({
  selector: 'yep-page-header',
  host: {
    // Evita que el input `title` deje un tooltip nativo sobre todo el encabezado.
    '[attr.title]': 'null',
  },
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
})
export class PageHeader {
  readonly title = defineInput.required<string>();
  readonly subtitle = defineInput('');
  readonly eyebrow = defineInput('');
}
