import { Component, input as defineInput } from '@angular/core';

export type IconTileSize = 36 | 48;

/**
 * Contenedor de icono de P5 (03-componentes · yep-avatar · yep-icon-tile). Un solo estilo en toda la app:
 * fondo `--color-surface-muted` e icono tinta; `active` lo pasa a verde.
 *
 * ```html
 * <yep-icon-tile><svg lucideSmartphone></svg></yep-icon-tile>
 * <yep-icon-tile [size]="48" [active]="true"><svg lucideMail></svg></yep-icon-tile>
 * ```
 *
 * El icono se proyecta: 20 px en el tamaño 36 y 24 px en el 48. Es decorativo; si el icono da
 * información, el texto que lo acompaña la debe repetir.
 */
@Component({
  selector: 'yep-icon-tile',
  templateUrl: './icon-tile.html',
  styleUrl: './icon-tile.scss',
})
export class IconTile {
  readonly size = defineInput<IconTileSize>(36);
  readonly active = defineInput(false);
}
