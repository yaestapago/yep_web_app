import { Component, input as defineInput } from '@angular/core';

export type BannerTone = 'ink' | 'lime' | 'paper';

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
 * - La diagonal de marca (P9) entra desde la esquina superior derecha con `--motion-brand`.
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

  protected readonly titleId = `yep-banner-title-${nextBannerId++}`;
}
