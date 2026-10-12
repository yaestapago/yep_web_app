import { Component, computed, inject, input as defineInput, output } from '@angular/core';
import { LucideCopy } from '@lucide/angular';

import { IconButton } from '../icon-button/icon-button';
import { DescriptionList } from './description-list';

type DescriptionItemSpan = 1 | 2 | 3;

/**
 * Un dato de `yep-description-list`: etiqueta + valor proyectado.
 *
 * `copy` con valor muestra un botón de copiar; al pulsarlo se emite `copied` y la página llama a su
 * método actual (el componente no toca el portapapeles). `span` = columnas que ocupa (máximo las de la lista).
 */
@Component({
  selector: 'yep-description-item',
  imports: [IconButton],
  host: {
    role: 'listitem',
    class: 'yep-description-item',
    '[class.yep-description-item--inline]': 'inline()',
    '[style.--yep-dl-span]': 'effectiveSpan()',
  },
  templateUrl: './description-item.html',
  styleUrl: './description-item.scss',
})
export class DescriptionItem {
  private readonly list = inject(DescriptionList, { optional: true });

  readonly label = defineInput.required<string>();
  readonly hint = defineInput('');
  readonly mono = defineInput(false);
  readonly copy = defineInput('');
  readonly span = defineInput<DescriptionItemSpan>(1);
  readonly copied = output<void>();

  protected readonly copyIcon = LucideCopy;

  protected readonly inline = computed(() => this.list?.layout() === 'inline');
  protected readonly effectiveSpan = computed(() =>
    Math.min(this.span(), this.list?.columns() ?? this.span()),
  );
}
