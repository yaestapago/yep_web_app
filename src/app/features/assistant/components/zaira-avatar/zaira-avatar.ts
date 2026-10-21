import { Component, input as defineInput } from '@angular/core';

let nextClipId = 0;

/**
 * Caricatura de Zaira, la asistente virtual: plana, con contorno tinta y los
 * colores de marca (más `--illustration-skin` / `--illustration-blush`), sobre
 * el círculo verde. Decorativa: el texto accesible lo pone quien la usa.
 */
@Component({
  selector: 'app-zaira-avatar',
  templateUrl: './zaira-avatar.html',
  styleUrl: './zaira-avatar.scss',
  host: {
    'aria-hidden': 'true',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
})
export class ZairaAvatar {
  /** Diámetro en px. */
  readonly size = defineInput(40);
  /** Punto lima de "en línea" abajo a la derecha. */
  readonly online = defineInput(false);

  /** Cada instancia necesita su propio `clipPath` (puede haber varias en la página). */
  protected readonly clipId = `zaira-avatar-clip-${nextClipId++}`;
}
