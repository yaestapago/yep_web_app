import { Directive, ElementRef, inject, input as defineInput } from '@angular/core';

export type MenuItemTone = 'neutral' | 'danger';

/**
 * Ítem de `yep-menu` (03-componentes · yep-menu). Se pone sobre un `<button>` (o `<a>`) proyectado:
 *
 * ```html
 * <button yepMenuItem (click)="configurar()"><svg lucideSettings></svg> Configuración</button>
 * <button yepMenuItem tone="danger" (click)="eliminar()"><svg lucideTrash2></svg> Eliminar</button>
 * ```
 *
 * Pone `role="menuitem"`, `tabindex="-1"` (el menú mueve el foco con flechas) y `type="button"` en
 * botones para que no envíen formularios. `tone="danger"` pinta el texto en `--color-error-strong` (P3).
 * Los estilos viven en `menu.scss` bajo `.yep-menu__item`.
 */
@Directive({
  selector: '[yepMenuItem]',
  host: {
    class: 'yep-menu__item',
    role: 'menuitem',
    tabindex: '-1',
    '[class.yep-menu__item--danger]': "tone() === 'danger'",
    '[attr.type]': "isButton ? 'button' : null",
  },
})
export class MenuItem {
  readonly tone = defineInput<MenuItemTone>('neutral');

  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly isButton = this.element.tagName === 'BUTTON';

  /** Un ítem deshabilitado (`disabled` nativo o `aria-disabled="true"`) no recibe foco ni se elige. */
  get disabled(): boolean {
    return (
      (this.element as HTMLButtonElement).disabled === true ||
      this.element.getAttribute('aria-disabled') === 'true'
    );
  }

  focus(): void {
    this.element.focus();
  }
}
