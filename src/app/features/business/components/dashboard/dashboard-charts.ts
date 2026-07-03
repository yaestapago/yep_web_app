import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, input as defineInput, signal } from '@angular/core';
import type { ChartData, ChartOptions, ChartType } from 'chart.js';
import { LucideChartPie, LucideMaximize2, LucideSettings2 } from '@lucide/angular';

import { Button } from '../../../../shared/ui/button/button';
import { ChartCanvas } from '../../../../shared/ui/chart-canvas/chart-canvas';
import { Checkbox } from '../../../../shared/ui/checkbox/checkbox';
import { Modal } from '../../../../shared/ui/modal/modal';
import type { SourceEvent } from '../../../../shared/models/source-event.models';
import type { PaymentTransaction } from '../../../../shared/models/transaction.models';
import {
  TRANSACTION_CATEGORIES,
  transactionCategory,
  transactionCategoryLabel,
} from '../../../../shared/utils/transaction-status';

interface ChartView {
  id: string;
  type: ChartType;
  data: ChartData;
  options: ChartOptions;
  ariaLabel: string;
}

interface CatalogItem {
  id: string;
  title: string;
  description: string;
}

const CATALOG: CatalogItem[] = [
  { id: 'bankAmounts', title: 'Montos por banco', description: 'Dona de lo recibido por banco.' },
  {
    id: 'dailyCaptured',
    title: 'Capturado por día',
    description: 'Barras del monto de los últimos 7 días.',
  },
  {
    id: 'statusDistribution',
    title: 'Distribución por estado',
    description: 'Recibida, verificada, pendiente y rechazada.',
  },
  {
    id: 'paidVsPending',
    title: 'Validados vs pendientes',
    description: 'Comparativo de conteo de pagos.',
  },
  {
    id: 'eventsBySource',
    title: 'Eventos por fuente',
    description: 'Dona de eventos por tipo de origen.',
  },
];

const DEFAULT_SELECTION = ['bankAmounts', 'dailyCaptured', 'statusDistribution'];
const STORAGE_PREFIX = 'yep:dashboard:charts:';

const SOURCE_LABELS: Record<string, string> = {
  WHATSAPP_INBOUND: 'WhatsApp',
  OCR_UPLOAD: 'Comprobante (OCR)',
  BANK_SMS: 'SMS bancario',
  BANK_WEBHOOK: 'Webhook bancario',
  BANK_API_POLL: 'API bancaria',
  MANUAL_ENTRY: 'Manual',
  NOTIFIER_APP: 'App notificadora',
};

/**
 * Zona 1 (parte gráfica): módulo de gráficas predefinidas que el usuario elige
 * con el botón de configurar. La selección se guarda en `localStorage` por
 * negocio. Solo se ofrecen gráficas que se calculan con datos reales.
 */
@Component({
  selector: 'app-dashboard-charts',
  imports: [Button, ChartCanvas, Checkbox, Modal, LucideChartPie, LucideMaximize2, LucideSettings2],
  templateUrl: './dashboard-charts.html',
  styleUrls: ['./dashboard-shared.scss', './dashboard-charts.scss'],
})
export class DashboardChartsPanel {
  private readonly document = inject(DOCUMENT);

  readonly transactions = defineInput.required<PaymentTransaction[]>();
  readonly sourceEvents = defineInput.required<SourceEvent[]>();
  readonly businessId = defineInput<string | null>(null);
  readonly catalog = CATALOG;
  readonly configOpen = signal(false);
  readonly selected = signal<string[]>(DEFAULT_SELECTION);
  /** Selección temporal mientras el modal de configuración está abierto. */
  readonly draft = signal<Set<string>>(new Set(DEFAULT_SELECTION));
  /** Gráfica abierta en grande (su id), o null. */
  readonly expandedId = signal<string | null>(null);

  constructor() {
    // Carga la selección guardada cuando cambia el negocio activo.
    effect(() => {
      const id = this.businessId();
      this.selected.set(this.loadSelection(id));
    });
  }

  readonly views = computed<ChartView[]>(() => {
    const palette = this.palette();
    const txs = this.transactions();
    const events = this.sourceEvents();

    return this.selected()
      .map((id) => this.build(id, txs, events, palette))
      .filter((view): view is ChartView => view !== null);
  });

  readonly hasData = computed(
    () => this.transactions().length > 0 || this.sourceEvents().length > 0,
  );

  /** Vista de la gráfica expandida; se recalcula con los datos (sigue viva). */
  readonly expandedView = computed<ChartView | null>(() => {
    const id = this.expandedId();
    return id ? (this.views().find((view) => view.id === id) ?? null) : null;
  });

  chartTitle(id: string): string {
    return CATALOG.find((item) => item.id === id)?.title ?? id;
  }

  expand(id: string): void {
    this.expandedId.set(id);
  }

  closeExpanded(): void {
    this.expandedId.set(null);
  }

  // --- Configuración --------------------------------------------------------

  openConfig(): void {
    this.draft.set(new Set(this.selected()));
    this.configOpen.set(true);
  }

  closeConfig(): void {
    this.configOpen.set(false);
  }

  isDraftSelected(id: string): boolean {
    return this.draft().has(id);
  }

  toggleDraft(id: string): void {
    this.draft.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  applyConfig(): void {
    // Conserva el orden del catálogo para una disposición estable.
    const next = CATALOG.filter((item) => this.draft().has(item.id)).map((item) => item.id);
    this.selected.set(next);
    this.saveSelection(this.businessId(), next);
    this.configOpen.set(false);
  }

  // --- Construcción de cada gráfica -----------------------------------------

  private build(
    id: string,
    txs: PaymentTransaction[],
    events: SourceEvent[],
    palette: string[],
  ): ChartView | null {
    switch (id) {
      case 'bankAmounts':
        return this.bankAmounts(txs, palette);
      case 'dailyCaptured':
        return this.dailyCaptured(txs, palette);
      case 'statusDistribution':
        return this.statusDistribution(txs);
      case 'paidVsPending':
        return this.paidVsPending(txs, palette);
      case 'eventsBySource':
        return this.eventsBySource(events, palette);
      default:
        return null;
    }
  }

  private bankAmounts(txs: PaymentTransaction[], palette: string[]): ChartView {
    const buckets = new Map<string, number>();
    for (const tx of txs) {
      const key = tx.bankId || 'Sin banco';
      buckets.set(key, (buckets.get(key) ?? 0) + tx.amount);
    }
    const labels = [...buckets.keys()];
    return {
      id: 'bankAmounts',
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: [...buckets.values()],
            backgroundColor: this.cycle(palette, labels.length),
            borderWidth: 0,
          },
        ],
      },
      options: this.doughnutOptions(),
      ariaLabel: 'Montos recibidos por banco',
    };
  }

  private dailyCaptured(txs: PaymentTransaction[], palette: string[]): ChartView {
    const days: { label: string; total: number }[] = [];
    const buckets = new Map<string, number>();
    for (const tx of txs) {
      const date = new Date(tx.transactionDate);
      if (Number.isNaN(date.getTime())) {
        continue;
      }
      const key = this.dayKey(date);
      buckets.set(key, (buckets.get(key) ?? 0) + tx.amount);
    }
    const now = new Date();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(now.getTime() - offset * 86_400_000);
      days.push({
        label: date.toLocaleDateString('es', { weekday: 'short' }),
        total: buckets.get(this.dayKey(date)) ?? 0,
      });
    }
    return {
      id: 'dailyCaptured',
      type: 'bar',
      data: {
        labels: days.map((d) => d.label),
        datasets: [
          { data: days.map((d) => d.total), backgroundColor: palette[0], borderRadius: 6 },
        ],
      },
      options: this.barOptions(),
      ariaLabel: 'Monto capturado por día en los últimos 7 días',
    };
  }

  private statusDistribution(txs: PaymentTransaction[]): ChartView {
    const counts = new Map<string, number>(TRANSACTION_CATEGORIES.map((c) => [c, 0]));
    for (const tx of txs) {
      const cat = transactionCategory(tx.status);
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    const toneColors: Record<string, string> = {
      recibida: this.cssVar('--color-text-muted'),
      verificada: this.cssVar('--color-success'),
      pendiente: this.cssVar('--color-warning'),
      rechazada: this.cssVar('--color-error'),
    };
    return {
      id: 'statusDistribution',
      type: 'doughnut',
      data: {
        labels: TRANSACTION_CATEGORIES.map((c) => transactionCategoryLabel(c)),
        datasets: [
          {
            data: TRANSACTION_CATEGORIES.map((c) => counts.get(c) ?? 0),
            backgroundColor: TRANSACTION_CATEGORIES.map((c) => toneColors[c]),
            borderWidth: 0,
          },
        ],
      },
      options: this.doughnutOptions(),
      ariaLabel: 'Distribución de transacciones por estado',
    };
  }

  private paidVsPending(txs: PaymentTransaction[], palette: string[]): ChartView {
    const paid = txs.filter((t) => t.verification.canBeConsideredPaid).length;
    const pending = txs.filter((t) =>
      ['CREATED', 'PENDING_VERIFICATION', 'NEEDS_REVIEW'].includes(t.status),
    ).length;
    return {
      id: 'paidVsPending',
      type: 'bar',
      data: {
        labels: ['Validados', 'Pendientes'],
        datasets: [
          {
            data: [paid, pending],
            backgroundColor: [this.cssVar('--color-success'), this.cssVar('--color-warning')],
            borderRadius: 6,
          },
        ],
      },
      options: this.barOptions(),
      ariaLabel: 'Comparativo de pagos validados contra pendientes',
    };
  }

  private eventsBySource(events: SourceEvent[], palette: string[]): ChartView {
    const buckets = new Map<string, number>();
    for (const event of events) {
      const key = SOURCE_LABELS[event.sourceType] ?? event.sourceType;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const labels = [...buckets.keys()];
    return {
      id: 'eventsBySource',
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: [...buckets.values()],
            backgroundColor: this.cycle(palette, labels.length),
            borderWidth: 0,
          },
        ],
      },
      options: this.doughnutOptions(),
      ariaLabel: 'Eventos por tipo de fuente',
    };
  }

  // --- Opciones / colores ----------------------------------------------------

  private doughnutOptions(): ChartOptions {
    const options: ChartOptions<'doughnut'> = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            padding: 8,
            color: this.cssVar('--color-text-secondary'),
            font: { size: 11 },
          },
        },
      },
    };
    return options as ChartOptions;
  }

  private barOptions(): ChartOptions {
    const grid = this.cssVar('--color-border');
    const text = this.cssVar('--color-text-secondary');
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: text, font: { size: 10 } } },
        y: {
          beginAtZero: true,
          grid: { color: grid },
          ticks: { color: text, font: { size: 10 }, maxTicksLimit: 4 },
        },
      },
    };
  }

  private palette(): string[] {
    return [
      this.cssVar('--color-primary'),
      this.cssVar('--color-secondary'),
      this.cssVar('--color-accent'),
      this.cssVar('--color-warning'),
      this.cssVar('--color-error'),
      this.cssVar('--color-success'),
    ];
  }

  private cycle(palette: string[], length: number): string[] {
    return Array.from({ length }, (_, index) => palette[index % palette.length]);
  }

  private cssVar(name: string): string {
    const root = this.document.documentElement;
    const value = this.document.defaultView?.getComputedStyle(root).getPropertyValue(name).trim();
    return value || '#00c27d';
  }

  private dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  private loadSelection(businessId: string | null): string[] {
    if (!businessId) {
      return DEFAULT_SELECTION;
    }
    try {
      const raw = this.document.defaultView?.localStorage.getItem(STORAGE_PREFIX + businessId);
      if (!raw) {
        return DEFAULT_SELECTION;
      }
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (id): id is string => typeof id === 'string' && CATALOG.some((c) => c.id === id),
        );
        return valid.length > 0 ? valid : DEFAULT_SELECTION;
      }
    } catch {
      // Ignora datos corruptos y usa la selección por defecto.
    }
    return DEFAULT_SELECTION;
  }

  private saveSelection(businessId: string | null, selection: string[]): void {
    if (!businessId) {
      return;
    }
    try {
      this.document.defaultView?.localStorage.setItem(
        STORAGE_PREFIX + businessId,
        JSON.stringify(selection),
      );
    } catch {
      // Sin persistencia disponible: la selección sigue activa en memoria.
    }
  }
}
