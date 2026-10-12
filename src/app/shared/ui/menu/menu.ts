import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  ViewEncapsulation,
  afterNextRender,
  booleanAttribute,
  contentChildren,
  inject,
  input as defineInput,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LucideEllipsis } from '@lucide/angular';

import { MenuItem } from './menu-item';

export type MenuAlign = 'start' | 'end';

let nextMenuId = 0;

/** Margen mínimo entre el panel y el borde de la ventana. */
const VIEWPORT_MARGIN = 8;
/** Separación entre el disparador y el panel. */
const TRIGGER_GAP = 4;

/**
 * Menú de acciones "Más" (P3 · 03-componentes · yep-menu). Sin dependencias nuevas (no hay `@angular/cdk`).
 *
 * ```html
 * <yep-menu label="Más acciones">
 *   <button yepMenuItem (click)="configurar()"><svg lucideSettings></svg> Configuración</button>
 *   <button yepMenuItem tone="danger" (click)="eliminar()"><svg lucideTrash2></svg> Eliminar</button>
 * </yep-menu>
 * ```
 *
 * - Disparador: botón de icono `ellipsis` (mismo aspecto que `yep-icon-button`, `size` sm 32 px / md 40 px)
 *   con `aria-haspopup="menu"`, `aria-expanded` y `aria-controls`; `label` va en `aria-label` y `title`.
 * - Panel `role="menu"` con `--shadow-overlay`. Se posiciona con `position: fixed` bajo el disparador,
 *   alineado a su borde derecho (`align="end"`) o izquierdo (`start`), y se corrige para no salirse de la
 *   ventana (también a 390 px): se desplaza en horizontal y se abre hacia arriba si no cabe abajo. Fijo en
 *   vez de absoluto para que no lo recorte el scroll de `.yep-table-wrap` o de un modal.
 * - Teclado: Enter/Espacio/↓ abren y enfocan el primer ítem, ↑ abre en el último; dentro, ↑/↓ circulan,
 *   Inicio/Fin saltan, Escape cierra y devuelve el foco al disparador, Tab cierra.
 * - Cierra con clic fuera y al elegir un ítem (el `(click)` del ítem se ejecuta antes).
 *
 * Sin encapsulación para que los estilos lleguen a los ítems proyectados; todo vive bajo `.yep-menu`.
 */
@Component({
  selector: 'yep-menu',
  imports: [LucideEllipsis],
  host: {
    class: 'yep-menu',
    '[class.yep-menu--open]': 'open()',
    '(document:click)': 'onDocumentClick($event)',
    '(window:resize)': 'reposition()',
  },
  templateUrl: './menu.html',
  styleUrl: './menu.scss',
  encapsulation: ViewEncapsulation.None,
})
export class Menu {
  /** Nombre accesible del disparador y del menú. */
  readonly label = defineInput('Más acciones');
  readonly size = defineInput<'sm' | 'md'>('sm');
  readonly align = defineInput<MenuAlign>('end');
  readonly disabled = defineInput(false, { transform: booleanAttribute });
  readonly dataCy = defineInput('');

  /** Emite `true` al abrir y `false` al cerrar. */
  readonly openChange = output<boolean>();

  protected readonly open = signal(false);
  protected readonly triggerId = `yep-menu-trigger-${nextMenuId}`;
  protected readonly panelId = `yep-menu-panel-${nextMenuId++}`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly items = contentChildren(MenuItem, { descendants: true });
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  private readonly onScroll = (event: Event) => {
    // El scroll dentro del propio panel no lo mueve.
    if (event.target instanceof Node && this.panel().nativeElement.contains(event.target)) {
      return;
    }
    this.reposition();
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.removeScrollListener());
  }

  get isOpen(): boolean {
    return this.open();
  }

  /** Abre el menú y enfoca el primer ítem (`'first'`), el último (`'last'`) o ninguno (`null`). */
  openMenu(focus: 'first' | 'last' | null = 'first'): void {
    if (this.disabled()) {
      return;
    }
    if (!this.open()) {
      this.open.set(true);
      this.openChange.emit(true);
      window.addEventListener('scroll', this.onScroll, true);
    }
    afterNextRender(
      () => {
        this.reposition();
        if (focus) {
          this.focusItem(focus === 'first' ? 0 : -1);
        }
      },
      { injector: this.injector },
    );
  }

  /** Cierra el menú; con `restoreFocus` devuelve el foco al disparador. */
  close(restoreFocus = false): void {
    if (this.open()) {
      this.open.set(false);
      this.openChange.emit(false);
      this.removeScrollListener();
    }
    if (restoreFocus) {
      this.trigger().nativeElement.focus();
    }
  }

  protected toggle(): void {
    if (this.open()) {
      this.close(true);
    } else {
      this.openMenu('first');
    }
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.openMenu('first');
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.openMenu('last');
        break;
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation();
          this.close(true);
        }
        break;
    }
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    const enabled = this.enabledItems();
    const current = enabled.findIndex((item) => item.element === document.activeElement);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusItem(current < 0 ? 0 : (current + 1) % enabled.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.focusItem(current < 0 ? -1 : (current - 1 + enabled.length) % enabled.length);
        break;
      case 'Home':
        event.preventDefault();
        this.focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusItem(-1);
        break;
      case 'Escape':
        // Que un modal contenedor no se cierre también.
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        break;
      case 'Tab':
        // El foco sigue su curso natural; el menú se cierra.
        this.close(false);
        break;
    }
  }

  protected onPanelClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const item = this.items().find((candidate) => candidate.element.contains(target));
    if (item && !item.disabled) {
      this.close(true);
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.contains(event.target as Node)) {
      this.close(false);
    }
  }

  /** Coloca el panel bajo el disparador sin salirse de la ventana. */
  protected reposition(): void {
    if (!this.open()) {
      return;
    }
    const panel = this.panel().nativeElement;
    const anchor = this.trigger().nativeElement.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;

    let left = this.align() === 'end' ? anchor.right - width : anchor.left;
    left = Math.min(left, viewportWidth - width - VIEWPORT_MARGIN);
    left = Math.max(left, VIEWPORT_MARGIN);

    let top = anchor.bottom + TRIGGER_GAP;
    const above = anchor.top - TRIGGER_GAP - height;
    if (top + height > viewportHeight - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN) {
      top = above;
    }

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }

  private enabledItems(): MenuItem[] {
    return this.items().filter((item) => !item.disabled);
  }

  /** Enfoca el ítem habilitado en `index` (negativo cuenta desde el final). */
  private focusItem(index: number): void {
    const enabled = this.enabledItems();
    if (!enabled.length) {
      return;
    }
    enabled.at(index)?.focus();
  }

  private removeScrollListener(): void {
    window.removeEventListener('scroll', this.onScroll, true);
  }
}
