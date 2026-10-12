import { Component, ElementRef, computed, inject, input as defineInput, output } from '@angular/core';

export interface SegmentedOption {
  value: string;
  label: string;
  count?: number;
}

/**
 * Control segmentado para alternar vistas o filtros (03-componentes · yep-segmented).
 *
 * ```html
 * <yep-segmented aria-label="Estado" [options]="options" [(value)]="status" />
 * <yep-segmented [options]="options" [value]="status()" (valueChange)="onStatus($event)" />
 * ```
 *
 * Controlado: emite `valueChange` y muestra como activa la opción de `value`. El host es el
 * `role="tablist"` (pon ahí el `aria-label`); cada opción es un `role="tab"`. Teclado: flechas,
 * Inicio y Fin mueven el foco y seleccionan.
 */
@Component({
  selector: 'yep-segmented',
  host: {
    role: 'tablist',
    'aria-orientation': 'horizontal',
    '(keydown)': 'onKeydown($event)',
  },
  templateUrl: './segmented.html',
  styleUrl: './segmented.scss',
})
export class Segmented {
  readonly options = defineInput.required<readonly SegmentedOption[]>();
  readonly value = defineInput.required<string>();
  readonly valueChange = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Índice que recibe el foco con Tab: la opción activa o, si ninguna lo está, la primera. */
  protected readonly focusIndex = computed(() =>
    Math.max(
      0,
      this.options().findIndex((option) => option.value === this.value()),
    ),
  );

  select(value: string): void {
    if (value !== this.value()) {
      this.valueChange.emit(value);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const options = this.options();
    if (options.length === 0) {
      return;
    }
    const tabs = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.yep-segmented__option'),
    );
    const current = tabs.indexOf(event.target as HTMLButtonElement);
    const from = current === -1 ? this.focusIndex() : current;
    const last = options.length - 1;

    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = from === last ? 0 : from + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = from === 0 ? last : from - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }

    event.preventDefault();
    tabs[next]?.focus();
    this.select(options[next].value);
  }
}
