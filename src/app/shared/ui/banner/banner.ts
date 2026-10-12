import { Component, input as defineInput } from '@angular/core';

export type BannerTone = 'ink' | 'lime' | 'paper';
export type BannerSize = 'md' | 'compact';

let nextBannerId = 0;

/**
 * Banner de marca (03-componentes · yep-banner). Para el home (R10, R11).
 *
 * ```html
 * <yep-banner
 *   eyebrow="Novedad · Panel de pagos"
 *   title="Un panel de pagos más claro"
 *   text="Unificamos eventos y transacciones en un solo tablero."
 *   imageSrc="illustrations/home-panel.svg"
 * >
 *   <yep-button slot="actions" (clicked)="irAlPanel()">Ir al panel de control</yep-button>
 *   <yep-button slot="actions" variant="secondary" tone="on-brand">Ver novedades</yep-button>
 * </yep-banner>
 * ```
 *
 * - `tone="ink"` (por defecto): fondo fijo `--brand-ink`, igual en claro y en oscuro.
 *   Acciones: `yep-button` primario y `secondary` con `tone="on-brand"`.
 * - `tone="lime"`: fondo `--brand-lime`, todo en `--brand-ink`. P4: un solo banner, chip o etiqueta
 *   lima por vista.
 * - `tone="paper"`: fondo `--color-surface` con borde.
 * - `imageSrc`: ilustración de `public/illustrations/`, a la derecha y oculta por debajo de 640 px.
 *   Es decorativa (`alt=""`): el título y el texto ya dicen lo que importa.
 * - `size="compact"`: para columnas estrechas (lima "Invita a tu equipo" del home): relleno 24/28,
 *   sin alto mínimo, título 28 px y contenido en columna. La ilustración no se muestra.
 * - Proyección: `[slot=actions]` (botones o enlaces `a[yepButton]`) y `[slot=icon]` (p. ej. un
 *   `yep-icon-tile`, arriba del eyebrow y el título). En `lime`, el icon-tile va en tinta con el
 *   icono lima, como en el mockup.
 * - La diagonal de marca (P9) entra desde la esquina superior derecha con `--motion-brand`. Nunca
 *   queda detrás del texto: el texto se reserva su ancho, y por debajo de 640 px de ancho del
 *   propio banner (container query, no el viewport) la diagonal se encoge a 104 × 80 px.
 */
@Component({
  selector: 'yep-banner',
  host: {
    // Evita que el input `title` deje un tooltip nativo sobre todo el banner.
    '[attr.title]': 'null',
  },
  templateUrl: './banner.html',
  styleUrl: './banner.scss',
})
export class Banner {
  readonly eyebrow = defineInput('');
  readonly title = defineInput.required<string>();
  readonly text = defineInput('');
  readonly tone = defineInput<BannerTone>('ink');
  readonly imageSrc = defineInput('');
  readonly size = defineInput<BannerSize>('md');

  protected readonly titleId = `yep-banner-title-${nextBannerId++}`;
}
