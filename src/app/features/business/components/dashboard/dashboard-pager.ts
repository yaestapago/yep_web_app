import { Component, computed, input, output } from '@angular/core';
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideChevronsLeft,
  LucideChevronsRight,
} from '@lucide/angular';

/**
 * Paginador compacto reutilizable para las zonas del panel. Siempre visible
 * (aunque haya una sola página) para dar una referencia estable de navegación.
 * No conoce los datos: recibe `page`/`totalPages` y emite el destino por
 * `pageChange`, ya validado contra los límites.
 */
@Component({
  selector: 'app-dashboard-pager',
  standalone: true,
  imports: [
    LucideChevronLeft,
    LucideChevronRight,
    LucideChevronsLeft,
    LucideChevronsRight,
  ],
  template: `
    <nav class="pager" aria-label="Paginación">
      <button
        type="button"
        class="pager__btn"
        (click)="go(1)"
        [disabled]="page() <= 1"
        aria-label="Primera página"
        title="Primera página"
      >
        <svg lucideChevronsLeft aria-hidden="true"></svg>
      </button>
      <button
        type="button"
        class="pager__btn"
        (click)="go(page() - 1)"
        [disabled]="page() <= 1"
        aria-label="Página anterior"
        title="Anterior"
      >
        <svg lucideChevronLeft aria-hidden="true"></svg>
      </button>
      <span class="pager__status">
        Página <strong>{{ page() }}</strong> de {{ totalPages() }}
        @if (total() > 0) {
          <span class="pager__total">· {{ total() }}</span>
        }
      </span>
      <button
        type="button"
        class="pager__btn"
        (click)="go(page() + 1)"
        [disabled]="page() >= totalPages()"
        aria-label="Página siguiente"
        title="Siguiente"
      >
        <svg lucideChevronRight aria-hidden="true"></svg>
      </button>
      <button
        type="button"
        class="pager__btn"
        (click)="go(totalPages())"
        [disabled]="page() >= totalPages()"
        aria-label="Última página"
        title="Última página"
      >
        <svg lucideChevronsRight aria-hidden="true"></svg>
      </button>
    </nav>
  `,
  styles: [
    `
      :host {
        display: block;
        flex: 0 0 auto;
      }

      .pager {
        align-items: center;
        border-top: 1px solid var(--color-border);
        display: flex;
        flex: 0 0 auto;
        gap: var(--space-1);
        justify-content: center;
        padding: var(--space-2) var(--space-3);
      }

      .pager__btn {
        align-items: center;
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        color: var(--color-text-secondary);
        cursor: pointer;
        display: inline-flex;
        height: var(--control-height-sm);
        justify-content: center;
        width: var(--control-height-sm);
      }

      .pager__btn:hover:not(:disabled) {
        background: color-mix(in srgb, var(--color-secondary) 10%, var(--color-surface));
        color: var(--color-text-primary);
      }

      .pager__btn:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }

      .pager__btn svg {
        height: 16px;
        width: 16px;
      }

      .pager__status {
        color: var(--color-text-secondary);
        font-size: var(--font-size-xs);
        padding: 0 var(--space-2);
        white-space: nowrap;
      }

      .pager__status strong {
        color: var(--color-text-primary);
      }

      .pager__total {
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class DashboardPager {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  /** Total de items (opcional), se muestra junto al indicador de página. */
  readonly total = input<number>(0);

  readonly pageChange = output<number>();

  /** Indicador derivado por si el consumidor lo necesita. */
  readonly canPrev = computed(() => this.page() > 1);
  readonly canNext = computed(() => this.page() < this.totalPages());

  go(target: number): void {
    const clamped = Math.min(Math.max(1, target), this.totalPages());
    if (clamped !== this.page()) {
      this.pageChange.emit(clamped);
    }
  }
}
