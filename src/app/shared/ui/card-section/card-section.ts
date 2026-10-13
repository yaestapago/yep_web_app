import { Component, input as defineInput } from '@angular/core';

/**
 * Agrupa dentro de una `yep-card` sin crear otra caja (P1 · 03-componentes · yep-card-section):
 * divisor superior de 1 px y subtítulo 13/600. Si es el primer elemento de la tarjeta no lleva divisor.
 *
 * ```html
 * <yep-card title="Notificador">
 *   <yep-card-section title="Conexión">…</yep-card-section>
 *   <yep-card-section title="Mensajes">…</yep-card-section>
 * </yep-card>
 * ```
 */
@Component({
  selector: 'yep-card-section',
  host: {
    // Evita que el input `title` deje un tooltip nativo sobre toda la sección.
    '[attr.title]': 'null',
  },
  templateUrl: './card-section.html',
  styleUrl: './card-section.scss',
})
export class CardSection {
  readonly title = defineInput('');
}
