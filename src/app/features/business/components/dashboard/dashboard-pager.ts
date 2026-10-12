import { Component, computed, input, output } from '@angular/core';
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideChevronsLeft,
  LucideChevronsRight,
} from '@lucide/angular';

import { IconButton } from '../../../../shared/ui/icon-button/icon-button';

/**
 * Paginador compacto reutilizable para las zonas del panel. Siempre visible
 * (aunque haya una sola página) para dar una referencia estable de navegación.
 * No conoce los datos: recibe `page`/`totalPages` y emite el destino por
 * `pageChange`, ya validado contra los límites.
 */
@Component({
  selector: 'app-dashboard-pager',
  standalone: true,
  imports: [IconButton],
  template: `
    <nav class="pager" aria-label="Paginación">
      <yep-icon-button
        label="Primera página"
        [icon]="firstIcon"
        [disabled]="page() <= 1"
        (clicked)="go(1)"
      />
      <yep-icon-button
        label="Página anterior"
        [icon]="prevIcon"
        [disabled]="page() <= 1"
        (clicked)="go(page() - 1)"
      />
      <span class="pager__status" aria-live="polite">
        Página <b class="pager__number">{{ page() }}</b> de
        <span class="pager__number">{{ totalPages() }}</span>
        @if (total() > 0) {
          <span class="pager__total">· {{ total() }}</span>
        }
      </span>
      <yep-icon-button
        label="Página siguiente"
        [icon]="nextIcon"
        [disabled]="page() >= totalPages()"
        (clicked)="go(page() + 1)"
      />
      <yep-icon-button
        label="Última página"
        [icon]="lastIcon"
        [disabled]="page() >= totalPages()"
        (clicked)="go(totalPages())"
      />
    </nav>
  `,
  styles: [
    `
      /* Mismo aspecto que yep-pagination (03 · yep-pagination), con primera y
         última página. */
      :host {
        display: block;
        flex: 0 0 auto;
      }

      .pager {
        align-items: center;
        border-top: var(--border-width) solid var(--color-border);
        display: flex;
        gap: var(--space-1);
        justify-content: flex-end;
        padding: var(--space-3) var(--space-4);
      }

      .pager__status {
        color: var(--color-text-secondary);
        font-size: 0.8125rem;
        font-weight: var(--font-weight-medium);
        line-height: 1.45;
        padding: 0 var(--space-1);
        white-space: nowrap;
      }

      .pager__number {
        font-family: var(--font-family-mono);
        font-variant-numeric: tabular-nums;
      }

      b.pager__number {
        color: var(--color-text-primary);
        font-weight: var(--font-weight-semibold);
      }

      .pager__total {
        color: var(--color-text-muted);
      }

      @media (max-width: 560px) {
        .pager {
          justify-content: center;
        }
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

  protected readonly firstIcon = LucideChevronsLeft;
  protected readonly prevIcon = LucideChevronLeft;
  protected readonly nextIcon = LucideChevronRight;
  protected readonly lastIcon = LucideChevronsRight;

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
