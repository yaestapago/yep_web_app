import {
  AfterViewInit,
  Directive,
  ElementRef,
  OnDestroy,
  inject,
  input,
  output,
} from '@angular/core';

/**
 * Calcula cuántas filas caben en el alto disponible del host (un contenedor con
 * scroll) y lo emite por `fit`. Permite paginar la tabla/lista al tamaño exacto
 * del viewport para que el panel no necesite scroll: cuando el host crece o se
 * encoge (p. ej. al ocultar las gráficas), recalcula y reemite.
 *
 * Uso:
 *   <div class="zone__body" appAutoFitRows="tbody tr" autoFitHeader="thead"
 *        (fit)="pageSize.set($event)"> … </div>
 */
@Directive({
  selector: '[appAutoFitRows]',
  standalone: true,
})
export class AutoFitRowsDirective implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Selector CSS de una fila representativa dentro del host. */
  readonly rowSelector = input.required<string>({ alias: 'appAutoFitRows' });
  /** Selector de un encabezado fijo (p. ej. `thead`) cuya altura se descuenta. */
  readonly headerSelector = input<string>('', { alias: 'autoFitHeader' });
  /** Separación vertical entre filas (px) cuando la lista usa `gap`. */
  readonly rowGap = input<number>(0, { alias: 'autoFitGap' });
  /** Filas que caben en el alto disponible (mínimo 1). */
  readonly fit = output<number>();

  private observer?: ResizeObserver;
  private frame = 0;
  private last = -1;

  ngAfterViewInit(): void {
    // En SSR/entornos sin DOM estas APIs no existen: no hay nada que medir.
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.observer = new ResizeObserver(() => this.schedule());
    this.observer.observe(this.host.nativeElement);
    this.schedule();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.frame) {
      cancelAnimationFrame(this.frame);
    }
  }

  /** Coalesce múltiples notificaciones de resize en un solo cálculo por frame. */
  private schedule(): void {
    if (this.frame) {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.measure();
    });
  }

  private measure(): void {
    const el = this.host.nativeElement;
    const row = el.querySelector<HTMLElement>(this.rowSelector());
    if (!row) {
      return;
    }
    const headerSel = this.headerSelector();
    const header = headerSel
      ? el.querySelector<HTMLElement>(headerSel)
      : null;
    const available = el.clientHeight - (header?.offsetHeight ?? 0);
    const rowHeight = row.getBoundingClientRect().height + this.rowGap();
    if (available <= 0 || rowHeight <= 0) {
      return;
    }
    const count = Math.max(1, Math.floor(available / rowHeight));
    if (count !== this.last) {
      this.last = count;
      this.fit.emit(count);
    }
  }
}
