import { DOCUMENT } from '@angular/common';
import {
  Component,
  HostListener,
  computed,
  effect,
  inject,
  input as defineInput,
  signal,
} from '@angular/core';
import type { ChartData, ChartOptions, ChartType } from 'chart.js';
import {
  LucideChartPie,
  LucideChevronLeft,
  LucideChevronRight,
  LucideMaximize2,
  LucideSettings2,
} from '@lucide/angular';

import { Button } from '../../../../shared/ui/button/button';
import { ChartCanvas } from '../../../../shared/ui/chart-canvas/chart-canvas';
import { Checkbox } from '../../../../shared/ui/checkbox/checkbox';
import { Modal } from '../../../../shared/ui/modal/modal';
import type { DashboardChartsSummary } from '../../../../shared/models/dashboard-summary.models';
import type { TransactionStatus } from '../../../../shared/models/transaction.models';
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
  EMAIL_GMAIL: 'Correo',
};

/**
 * Zona 1 (parte gráfica): módulo de gráficas predefinidas que el usuario elige
 * con el botón de configurar. La selección se guarda en `localStorage` por
 * negocio. Solo se ofrecen gráficas que se calculan con datos reales.
 */
@Component({
  selector: 'app-dashboard-charts',
  imports: [
    Button,
    ChartCanvas,
    Checkbox,
    Modal,
    LucideChartPie,
    LucideChevronLeft,
    LucideChevronRight,
    LucideMaximize2,
    LucideSettings2,
  ],
  templateUrl: './dashboard-charts.html',
  styleUrls: ['./dashboard-shared.scss', './dashboard-charts.scss'],
})
export class DashboardChartsPanel {
  private readonly document = inject(DOCUMENT);

  readonly charts = defineInput.required<DashboardChartsSummary>();
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
    const charts = this.charts();

    return this.selected()
      .map((id) => this.build(id, charts, palette))
      .filter((view): view is ChartView => view !== null);
  });

  readonly hasData = computed(() => {
    const charts = this.charts();
    return (
      charts.bankAmounts.length > 0 ||
      charts.dailyCaptured.length > 0 ||
      charts.statusDistribution.length > 0 ||
      charts.eventsBySource.length > 0
    );
  });

  /** Vista de la gráfica expandida; se recalcula con los datos (sigue viva). */
  readonly expandedView = computed<ChartView | null>(() => {
    const id = this.expandedId();
    return id ? (this.views().find((view) => view.id === id) ?? null) : null;
  });
  readonly canNavigateExpanded = computed(() => this.views().length > 1);

  chartTitle(id: string): string {
    return CATALOG.find((item) => item.id === id)?.title ?? id;
  }

  expand(id: string): void {
    this.expandedId.set(id);
  }

  closeExpanded(): void {
    this.expandedId.set(null);
  }

  navigateExpanded(direction: -1 | 1): void {
    const views = this.views();
    const current = this.expandedId();
    if (!current || views.length < 2) {
      return;
    }

    const index = views.findIndex((view) => view.id === current);
    const safeIndex = index >= 0 ? index : 0;
    const nextIndex = (safeIndex + direction + views.length) % views.length;
    this.expandedId.set(views[nextIndex].id);
  }

  @HostListener('document:keydown.arrowleft')
  previousExpandedFromKeyboard(): void {
    if (this.expandedView()) {
      this.navigateExpanded(-1);
    }
  }

  @HostListener('document:keydown.arrowright')
  nextExpandedFromKeyboard(): void {
    if (this.expandedView()) {
      this.navigateExpanded(1);
    }
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
    charts: DashboardChartsSummary,
    palette: string[],
  ): ChartView | null {
    switch (id) {
      case 'bankAmounts':
        return this.bankAmounts(charts, palette);
      case 'dailyCaptured':
        return this.dailyCaptured(charts, palette);
      case 'statusDistribution':
        return this.statusDistribution(charts);
      case 'paidVsPending':
        return this.paidVsPending(charts);
      case 'eventsBySource':
        return this.eventsBySource(charts, palette);
      default:
        return null;
    }
  }

  private bankAmounts(charts: DashboardChartsSummary, palette: string[]): ChartView {
    const labels = charts.bankAmounts.map((point) => point.key || 'Sin banco');
    return {
      id: 'bankAmounts',
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: charts.bankAmounts.map((point) => point.amount),
            backgroundColor: this.cycle(palette, labels.length),
            borderWidth: 0,
          },
        ],
      },
      options: this.doughnutOptions(),
      ariaLabel: 'Montos recibidos por banco',
    };
  }

  private dailyCaptured(charts: DashboardChartsSummary, palette: string[]): ChartView {
    return {
      id: 'dailyCaptured',
      type: 'bar',
      data: {
        labels: charts.dailyCaptured.map((point) => this.shortDateLabel(point.key)),
        datasets: [
          {
            data: charts.dailyCaptured.map((point) => point.amount),
            backgroundColor: palette[0],
            borderRadius: 6,
          },
        ],
      },
      options: this.barOptions(),
      ariaLabel: 'Monto capturado por día en los últimos 7 días',
    };
  }

  private statusDistribution(charts: DashboardChartsSummary): ChartView {
    const counts = new Map<string, number>(TRANSACTION_CATEGORIES.map((c) => [c, 0]));
    for (const point of charts.statusDistribution) {
      const cat = transactionCategory(point.key);
      counts.set(cat, (counts.get(cat) ?? 0) + point.count);
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

  private paidVsPending(charts: DashboardChartsSummary): ChartView {
    const paid = charts.paidVsPending.find((point) => point.key === 'paid')?.count ?? 0;
    const pending = charts.paidVsPending.find((point) => point.key === 'pending')?.count ?? 0;
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

  private eventsBySource(charts: DashboardChartsSummary, palette: string[]): ChartView {
    const labels = charts.eventsBySource.map((point) => SOURCE_LABELS[point.key] ?? point.key);
    return {
      id: 'eventsBySource',
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: charts.eventsBySource.map((point) => point.count),
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

  private shortDateLabel(value: string): string {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString('es', { month: 'short', day: 'numeric' });
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
