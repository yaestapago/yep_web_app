import { Component, computed, effect, input, output, signal } from '@angular/core';
import { LucideExternalLink, LucideFileText } from '@lucide/angular';

import { Button } from '../../../../shared/ui/button/button';
import { ButtonLink } from '../../../../shared/ui/button/button-link';
import { isPdfMime } from '../../utils/receipt-bank.util';

/**
 * Muestra el archivo de un comprobante a partir de su URL prefirmada: imagen en `<img>` y PDF con
 * un enlace, porque un `<img>` no sirve. La URL dura 5 minutos: si la imagen deja de cargar, ofrece
 * pedir otra. La URL no se guarda en ninguna parte.
 */
@Component({
  selector: 'app-receipt-file-preview',
  imports: [Button, ButtonLink, LucideExternalLink, LucideFileText],
  template: `
    @if (url(); as fileUrl) {
      @if (showImage()) {
        <img
          class="preview__img"
          data-testid="receipt-image"
          referrerpolicy="no-referrer"
          alt="Comprobante"
          [src]="fileUrl"
          (error)="imageFailed.set(true)"
        />
      } @else {
        <div class="preview__fallback">
          <svg lucideFileText aria-hidden="true"></svg>
          <p>
            {{
              isPdf()
                ? 'Este comprobante es un PDF. Ábrelo en otra pestaña.'
                : 'No pudimos mostrar la imagen. El enlace dura 5 minutos: pide otro o ábrelo aparte.'
            }}
          </p>
          <a
            yepButton
            variant="secondary"
            size="sm"
            data-testid="receipt-open-link"
            target="_blank"
            rel="noopener noreferrer"
            referrerpolicy="no-referrer"
            [href]="fileUrl"
          >
            <svg lucideExternalLink aria-hidden="true"></svg>
            {{ isPdf() ? 'Abrir PDF' : 'Abrir comprobante' }}
          </a>
          @if (!isPdf()) {
            <yep-button variant="ghost" size="sm" (clicked)="reload.emit()">Pedir otro enlace</yep-button>
          }
        </div>
      }
    }
  `,
  styleUrl: './receipt-file-preview.scss',
})
export class ReceiptFilePreview {
  readonly url = input<string | null>(null);
  readonly mimeType = input<string | null>(null);
  readonly reload = output<void>();

  readonly imageFailed = signal(false);
  readonly isPdf = computed(() => isPdfMime(this.mimeType()));
  readonly showImage = computed(() => !this.isPdf() && !this.imageFailed());

  constructor() {
    // Una URL nueva merece otro intento.
    effect(() => {
      this.url();
      this.imageFailed.set(false);
    });
  }
}
