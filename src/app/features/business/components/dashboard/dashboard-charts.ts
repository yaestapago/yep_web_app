import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
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

interface HeatmapCellView {
  hour: number;
  count: number;
  /** 0-100: qué tan intenso pintar la celda (0 = vacía, 100 = el máximo del rango). */
  colorPct: number;
}

interface HeatmapRowView {
  label: string;
  cells: HeatmapCellView[];
}

interface HeatmapView {
  hours: number[];
  rows: HeatmapRowView[];
}

type ChartView =
  | { id: string; kind: 'canvas'; type: ChartType; data: ChartData; options: ChartOptions; ariaLabel: string }
  | { id: string; kind: 'heatmap'; heatmap: HeatmapView; ariaLabel: string };

interface CatalogItem {
  id: string;
  title: string;
  description: string;
}

const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];
// Bloques de 3 horas (12, 3, 6, 9...) en vez de hora a hora: coincide con lo
// que ya agrupa el backend y deja más espacio por columna en el mapa.
const HOUR_BUCKET_SIZE = 3;
const HOURS = Array.from({ length: 24 / HOUR_BUCKET_SIZE }, (_, i) => i * HOUR_BUCKET_SIZE);

const CATALOG: CatalogItem[] = [
  {
    id: 'todayVsLastWeek',
    title: 'Hoy vs. hace 7 días',
    description: 'Compara el dinero notificado hoy contra el mismo día de la semana pasada.',
  },
  {
    id: 'hourlyHeatmap',
    title: 'Cuándo te pagan',
    description: 'Qué días y horas concentran más notificaciones de pago (últimas 8 semanas).',
  },
  {
    id: 'topCustomers',
    title: 'Top clientes',
    description: 'Los 5 remitentes que más dinero te han notificado en total.',
  },
  {
    id: 'weeklyTrend',
    title: 'Tendencia semanal',
    description: 'Dinero notificado por semana en las últimas 10 semanas.',
  },
];

const DEFAULT_SELECTION = CATALOG.map((item) => item.id);
const STORAGE_PREFIX = 'yep:dashboard:charts:';

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
    NgTemplateOutlet,
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
    const charts = this.charts();
    return this.selected()
      .map((id) => this.build(id, charts))
      .filter((view): view is ChartView => view !== null);
  });

  readonly hasData = computed(() => {
    const charts = this.charts();
    return (
      charts.todayVsLastWeek.today > 0 ||
      charts.todayVsLastWeek.lastWeek > 0 ||
      charts.hourlyHeatmap.length > 0 ||
      charts.topCustomers.length > 0 ||
      charts.weeklyTrend.length > 0
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

  private build(id: string, charts: DashboardChartsSummary): ChartView | null {
    switch (id) {
      case 'todayVsLastWeek':
        return this.todayVsLastWeek(charts);
      case 'hourlyHeatmap':
        return this.hourlyHeatmap(charts);
      case 'topCustomers':
        return this.topCustomers(charts);
      case 'weeklyTrend':
        return this.weeklyTrend(charts);
      default:
        return null;
    }
  }

  private todayVsLastWeek(charts: DashboardChartsSummary): ChartView {
    const { today, lastWeek, todayDate, lastWeekDate } = charts.todayVsLastWeek;
    return {
      id: 'todayVsLastWeek',
      kind: 'canvas',
      type: 'bar',
      data: {
        labels: [`Hoy (${this.shortDateLabel(todayDate)})`, this.shortDateLabel(lastWeekDate)],
        datasets: [
          {
            data: [today, lastWeek],
            backgroundColor: [this.cssVar('--color-primary'), this.cssVar('--color-text-muted')],
            borderRadius: 6,
          },
        ],
      },
      options: this.barOptions(),
      ariaLabel: 'Dinero notificado hoy comparado con el mismo día de la semana pasada',
    };
  }

  private hourlyHeatmap(charts: DashboardChartsSummary): ChartView {
    const cells = charts.hourlyHeatmap;
    const maxCount = cells.reduce((max, cell) => Math.max(max, cell.count), 0);

    const rows: HeatmapRowView[] = WEEKDAY_LABELS.map((label, dayOfWeek) => ({
      label,
      cells: HOURS.map((hour) => {
        const count = cells.find((c) => c.dayOfWeek === dayOfWeek && c.hour === hour)?.count ?? 0;
        return { hour, count, colorPct: maxCount > 0 ? Math.round((count / maxCount) * 100) : 0 };
      }),
    }));

    return {
      id: 'hourlyHeatmap',
      kind: 'heatmap',
      heatmap: { hours: HOURS, rows },
      ariaLabel: 'Mapa de calor de eventos de pago notificados por día de la semana y hora',
    };
  }

  private topCustomers(charts: DashboardChartsSummary): ChartView {
    const points = charts.topCustomers;
    return {
      id: 'topCustomers',
      kind: 'canvas',
      type: 'bar',
      data: {
        labels: points.map((point) => point.key),
        datasets: [
          {
            data: points.map((point) => point.amount),
            backgroundColor: this.cssVar('--color-primary'),
            borderRadius: 6,
          },
        ],
      },
      options: this.horizontalBarOptions(),
      ariaLabel: 'Remitentes que más dinero te han notificado en total',
    };
  }

  private weeklyTrend(charts: DashboardChartsSummary): ChartView {
    const points = charts.weeklyTrend;
    return {
      id: 'weeklyTrend',
      kind: 'canvas',
      type: 'line',
      data: {
        labels: points.map((point) => this.shortDateLabel(point.key)),
        datasets: [
          {
            data: points.map((point) => point.amount),
            borderColor: this.cssVar('--color-primary'),
            backgroundColor: `color-mix(in srgb, ${this.cssVar('--color-primary')} 18%, transparent)`,
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: this.lineOptions(),
      ariaLabel: 'Tendencia semanal de dinero notificado',
    };
  }

  // --- Opciones / colores ----------------------------------------------------

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

  private horizontalBarOptions(): ChartOptions {
    const grid = this.cssVar('--color-border');
    const text = this.cssVar('--color-text-secondary');
    const options: ChartOptions<'bar'> = {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: grid },
          ticks: { color: text, font: { size: 10 }, maxTicksLimit: 4 },
        },
        y: { grid: { display: false }, ticks: { color: text, font: { size: 10 } } },
      },
    };
    return options as ChartOptions;
  }

  private lineOptions(): ChartOptions {
    const grid = this.cssVar('--color-border');
    const text = this.cssVar('--color-text-secondary');
    const options: ChartOptions<'line'> = {
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
    return options as ChartOptions;
  }

  /** Color de celda del mapa de calor: mezcla `--color-primary` sobre la superficie según intensidad. */
  heatmapCellColor(colorPct: number): string {
    return `color-mix(in srgb, ${this.cssVar('--color-primary')} ${colorPct}%, ${this.cssVar('--color-surface')})`;
  }

  /** Hora en formato 12h compacto (ej. "12a", "3p") en vez de la hora militar 0-23. */
  hourLabel(hour: number): string {
    const period = hour < 12 ? 'a' : 'p';
    const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${twelveHour}${period}`;
  }

  /** Rango del bloque para el tooltip de una celda (ej. "3p–6p"). */
  hourRangeLabel(hour: number): string {
    return `${this.hourLabel(hour)}–${this.hourLabel((hour + HOUR_BUCKET_SIZE) % 24)}`;
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
