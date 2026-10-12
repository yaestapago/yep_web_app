import { Component, computed, input as defineInput, numberAttribute, output } from '@angular/core';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';

/**
 * Paginador de tabla (03-componentes · yep-table → yep-pagination), solo para pantallas que **ya** paginan.
 * No conoce los datos: recibe la página actual (desde 1) y el total de páginas, y emite por `pageChange`
 * la página destino ya limitada a `[1, pageCount]`.
 *
 * ```html
 * <yep-card padding="none" title="Eventos">
 *   <div class="yep-table-wrap"><table yepTable>…</table></div>
 *   <yep-pagination [page]="page()" [pageCount]="totalPages()" (pageChange)="goToPage($event)" />
 * </yep-card>
 * ```
 */
@Component({
  selector: 'yep-pagination',
  imports: [LucideChevronLeft, LucideChevronRight],
  host: { class: 'yep-pagination' },
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
})
export class Pagination {
  readonly page = defineInput.required({ transform: numberAttribute });
  readonly pageCount = defineInput.required({ transform: numberAttribute });
  readonly pageChange = output<number>();

  protected readonly total = computed(() => Math.max(1, Math.floor(this.pageCount() || 0)));
  protected readonly current = computed(() =>
    Math.min(Math.max(1, Math.floor(this.page() || 0)), this.total()),
  );
  protected readonly canPrev = computed(() => this.current() > 1);
  protected readonly canNext = computed(() => this.current() < this.total());

  protected go(target: number): void {
    const clamped = Math.min(Math.max(1, target), this.total());
    if (clamped !== this.current()) {
      this.pageChange.emit(clamped);
    }
  }
}
