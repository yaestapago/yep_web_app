import { Component, input as defineInput } from '@angular/core';

type CardPadding = 'md' | 'none';
type CardTone = 'default' | 'brand';

let nextCardId = 0;

/**
 * Contenedor único de tarjeta (P1 · 03-componentes · yep-card). Nunca se anida en otra tarjeta:
 * para agrupar dentro usa `yep-card-section`.
 *
 * ```html
 * <yep-card title="Datos del negocio" subtitle="Información general.">
 *   <yep-button slot="actions" variant="ghost" size="sm">Editar</yep-button>
 *   <yep-description-list>…</yep-description-list>
 *   <div slot="footer">…</div>
 * </yep-card>
 * ```
 *
 * Slots: `[slot=icon]` y `[slot=actions]` en la cabecera, contenido por defecto y `[slot=footer]`
 * (con divisor superior). `padding="none"` para tablas a sangre; `tone="brand"` para banners en tinta.
 */
@Component({
  selector: 'yep-card',
  host: {
    // Evita que el input `title` deje un tooltip nativo sobre toda la tarjeta.
    '[attr.title]': 'null',
  },
  templateUrl: './card.html',
  styleUrl: './card.scss',
})
export class Card {
  readonly title = defineInput('');
  readonly subtitle = defineInput('');
  readonly padding = defineInput<CardPadding>('md');
  readonly tone = defineInput<CardTone>('default');

  protected readonly titleId = `yep-card-title-${nextCardId++}`;
}
