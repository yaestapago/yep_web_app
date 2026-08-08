import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input as defineInput,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  LucideLoaderCircle,
  LucideListChecks,
  LucideReceipt,
  LucideSearch,
  LucideShieldCheck,
  LucideTriangleAlert,
} from '@lucide/angular';
import { debounceTime, distinctUntilChanged, skip } from 'rxjs';

import type {
  PaymentTransaction,
  TransactionFilters,
} from '../../../../shared/models/transaction.models';
import {
  isTransactionInvoiceable,
  isTransactionVerifiable,
  statusesForCategory,
  transactionCategory,
  transactionStatusLabel,
  transactionTone,
  type TransactionCategory,
} from '../../../../shared/utils/transaction-status';
import { AutoFitRowsDirective } from './auto-fit-rows.directive';
import { DashboardPager } from './dashboard-pager';

type PeriodFilter = 'all' | 'today' | '7d' | '30d';

/**
 * Zona 4: tabla compacta de transacciones. Los filtros (búsqueda por
 * referencia, estado, banco, periodo y rango de monto) se aplican server-side:
 * el panel emite los valores y la sección recarga con cursor. La paginación
 * dentro de la ventana cargada sigue siendo client-side para ajustarse al alto.
 */
@Component({
  selector: 'app-dashboard-transactions',
  imports: [
    CurrencyPipe,
    DatePipe,
    LucideListChecks,
    LucideLoaderCircle,
    LucideReceipt,
    LucideSearch,
    LucideShieldCheck,
    LucideTriangleAlert,
    AutoFitRowsDirective,
    DashboardPager,
  ],
  templateUrl: './dashboard-transactions.html',
  styleUrls: ['./dashboard-shared.scss', './dashboard-transactions.scss'],
})
export class DashboardTransactionsPanel {
  private readonly destroyRef = inject(DestroyRef);

  /** Transacciones ya filtradas y paginadas por el servidor. */
  readonly transactions = defineInput.required<PaymentTransaction[]>();
  readonly loading = defineInput(false);
  readonly error = defineInput('');
  readonly verifyingId = defineInput<string | null>(null);
  /** Bancos disponibles para el select (fuente estable: cuentas del negocio). */
  readonly bankOptions = defineInput<string[]>([]);
  /** Hay más páginas en el servidor más allá de lo cargado. */
  readonly hasMore = defineInput(false);
  readonly loadingMore = defineInput(false);

  readonly view = output<PaymentTransaction>();
  readonly verify = output<PaymentTransaction>();
  readonly applyInvoice = output<PaymentTransaction>();
  /** Cambios de filtro (con debounce) para que la sección recargue server-side. */
  readonly filtersChange = output<TransactionFilters>();
  /** Solicita la siguiente página del servidor (cursor). */
  readonly loadMore = output<void>();

  readonly search = signal('');
  readonly statusFilter = signal<string>('');
  readonly bankFilter = signal<string>('');
  readonly period = signal<PeriodFilter>('all');
  readonly amountMin = signal<string>('');
  readonly amountMax = signal<string>('');

  /** Filtros normalizados que se envían al servidor. */
  private readonly filterValue = computed<TransactionFilters>(() => {
    const since = this.periodStart(this.period());
    const category = this.statusFilter();
    const min = this.amountMin() ? Number(this.amountMin()) : undefined;
    const max = this.amountMax() ? Number(this.amountMax()) : undefined;
    return {
      q: this.search().trim() || undefined,
      statuses: category
        ? statusesForCategory(category as TransactionCategory).join(',')
        : undefined,
      bankId: this.bankFilter() || undefined,
      from: since !== null ? new Date(since).toISOString() : undefined,
      amountMin: Number.isFinite(min) ? min : undefined,
      amountMax: Number.isFinite(max) ? max : undefined,
    };
  });

  // --- Paginado client-side sobre la ventana cargada --------------------------
  /** Filas que caben en el alto disponible (lo calcula AutoFitRowsDirective). */
  readonly pageSize = signal(8);
  readonly page = signal(1);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.transactions().length / this.pageSize())),
  );

  /** Página efectiva acotada a [1, totalPages] (autocorrige si los datos
   *  encogen sin esperar interacción del usuario). */
  readonly currentPage = computed(() =>
    Math.min(Math.max(1, this.page()), this.totalPages()),
  );

  /** Página actual recortada. */
  readonly paged = computed(() => {
    const size = this.pageSize();
    const start = (this.currentPage() - 1) * size;
    return this.transactions().slice(start, start + size);
  });

  /** Estamos en la última página cargada (donde ofrecemos "cargar más"). */
  readonly onLastPage = computed(() => this.currentPage() >= this.totalPages());

  constructor() {
    // Cualquier cambio de filtro vuelve a la primera página. Depende solo de los
    // signals de filtro (no de los datos ni del tamaño), así un refresh o un
    // evento en vivo no patean al usuario fuera de su página actual.
    effect(() => {
      this.search();
      this.statusFilter();
      this.bankFilter();
      this.period();
      this.amountMin();
      this.amountMax();
      this.page.set(1);
    });

    // Emite los filtros a la sección con debounce (el primer valor —el estado
    // inicial vacío— se omite porque la sección ya hace la carga inicial).
    toObservable(this.filterValue)
      .pipe(
        skip(1),
        debounceTime(300),
        distinctUntilChanged(
          (a, b) => JSON.stringify(a) === JSON.stringify(b),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((filters) => this.filtersChange.emit(filters));
  }

  category(tx: PaymentTransaction): TransactionCategory {
    return transactionCategory(tx.status);
  }

  statusLabel(tx: PaymentTransaction): string {
    return transactionStatusLabel(tx.status);
  }

  tone(tx: PaymentTransaction): string {
    return transactionTone(tx.status);
  }

  isActionable(tx: PaymentTransaction): boolean {
    return isTransactionVerifiable(tx.status, tx.verification.canBeConsideredPaid);
  }

  isInvoiceActionable(tx: PaymentTransaction): boolean {
    return isTransactionInvoiceable(tx.status);
  }

  resetFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
    this.bankFilter.set('');
    this.period.set('all');
    this.amountMin.set('');
    this.amountMax.set('');
  }

  private periodStart(period: PeriodFilter): number | null {
    if (period === 'all') {
      return null;
    }
    const now = new Date();
    if (period === 'today') {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    }
    const days = period === '7d' ? 7 : 30;
    return now.getTime() - days * 86_400_000;
  }
}
