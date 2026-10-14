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

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { Card, IconButton, State } from '../../../../shared/ui';
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

interface LatencyMetricCell {
  /** Duración formateada y legible (ej. "8 s", "3.2 h"), o "Sin datos" si no hay muestras. */
  formatted: string;
  sampleCount: number;
}

interface LatencyTableRow {
  bankId: string;
  notifierLatency: LatencyMetricCell;
  emailForwardDelay: LatencyMetricCell;
  eventDelay: LatencyMetricCell;
}

type ChartView =
  | { id: string; kind: 'canvas'; type: ChartType; data: ChartData; options: ChartOptions; ariaLabel: string }
  | { id: string; kind: 'heatmap'; heatmap: HeatmapView; ariaLabel: string }
  | { id: string; kind: 'latency-table'; rows: LatencyTableRow[]; ariaLabel: string };

interface CatalogItem {
  id: string;
  title: string;
  description: string;
  /** Solo superadmin: no aparece en el catálogo (ni se renderiza) para el resto de usuarios. */
  superAdminOnly?: boolean;
}

const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
// Con 24 columnas no cabe una etiqueta en cada una: solo se rotula cada 3
// horas (12, 3, 6, 9...), pero las 24 celdas de datos siguen ahí.
const HOUR_LABEL_STEP = 3;

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
  {
    id: 'notificationLatency',
    title: 'Latencia de notificación',
    description:
      'Qué tan rápido nos llega cada banco: notificador→evento, transacción→reenvío de correo y transacción→evento. Solo superadmin.',
    superAdminOnly: true,
  },
];

const DEFAULT_SELECTION = CATALOG.map((item) => item.id);
const PRIMARY_CHART_ID = 'weeklyTrend';
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
    Card,
    ChartCanvas,
    Checkbox,
    IconButton,
    Modal,
    State,
    NgTemplateOutlet,
    LucideChartPie,
    LucideChevronLeft,
    LucideChevronRight,
    LucideMaximize2,
  ],
  templateUrl: './dashboard-charts.html',
  styleUrls: ['./dashboard-shared.scss', './dashboard-charts.scss'],
})
export class DashboardChartsPanel {
  private readonly document = inject(DOCUMENT);
  private readonly session = inject(AuthSessionService);

  protected readonly settingsIcon = LucideSettings2;

  readonly charts = defineInput.required<DashboardChartsSummary>();
  readonly businessId = defineInput<string | null>(null);
  /** Catálogo visible para el usuario actual: oculta los ítems `superAdminOnly` a todos los demás. */
  readonly catalog = computed<CatalogItem[]>(() =>
    CATALOG.filter((item) => !item.superAdminOnly || this.session.isSuperUser()),
  );
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
    const allowedIds = new Set(this.catalog().map((item) => item.id));
    return this.selected()
      .filter((id) => allowedIds.has(id))
      .map((id) => this.build(id, charts))
      .filter((view): view is ChartView => view !== null);
  });

  readonly hasData = computed(() => {
    const charts = this.charts();
    const hasLatencyData =
      this.session.isSuperUser() &&
      charts.notificationLatency.some(
        (point) =>
          point.notifierLatencyMs !== null ||
          point.emailForwardDelayMs !== null ||
          point.eventDelayMs !== null,
      );
    return (
      charts.todayVsLastWeek.today > 0 ||
      charts.todayVsLastWeek.lastWeek > 0 ||
      charts.hourlyHeatmap.length > 0 ||
      charts.topCustomers.length > 0 ||
      charts.weeklyTrend.length > 0 ||
      hasLatencyData
    );
  });

  /** Vista de la gráfica expandida; se recalcula con los datos (sigue viva). */
  readonly expandedView = computed<ChartView | null>(() => {
    const id = this.expandedId();
    return id ? (this.views().find((view) => view.id === id) ?? null) : null;
  });
  readonly canNavigateExpanded = computed(() => this.views().length > 1);
  /** "2 de 4" bajo el título del modal, para que se note que hay más gráficas. */
  readonly expandedPosition = computed(() => {
    const views = this.views();
    const index = views.findIndex((view) => view.id === this.expandedId());
    return index >= 0 && views.length > 1 ? `${index + 1} de ${views.length}` : '';
  });
  /**
   * Única gráfica que se dibuja en la tarjeta: a media columna las cuatro no se leían. La tendencia
   * semanal aguanta poco ancho; si el usuario la ocultó, va la primera que haya elegido. El resto se
   * ve en el modal ampliado.
   */
  readonly primaryView = computed<ChartView | null>(() => {
    const views = this.views();
    return views.find((view) => view.id === PRIMARY_CHART_ID) ?? views[0] ?? null;
  });

  chartTitle(id: string): string {
    return this.catalog().find((item) => item.id === id)?.title ?? id;
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
    const next = this.catalog()
      .filter((item) => this.draft().has(item.id))
      .map((item) => item.id);
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
      case 'notificationLatency':
        return this.notificationLatency(charts);
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
        return { hour, count, colorPct: this.heatmapIntensity(count, maxCount) };
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
            tension: 0.3,
          },
        ],
      },
      options: this.lineOptions(),
      ariaLabel: 'Tendencia semanal de dinero notificado',
    };
  }

  private notificationLatency(charts: DashboardChartsSummary): ChartView {
    const rows: LatencyTableRow[] = charts.notificationLatency.map((point) => ({
      bankId: point.bankId,
      notifierLatency: this.latencyCell(point.notifierLatencyMs, point.notifierSampleCount),
      emailForwardDelay: this.latencyCell(
        point.emailForwardDelayMs,
        point.emailForwardSampleCount,
      ),
      eventDelay: this.latencyCell(point.eventDelayMs, point.eventSampleCount),
    }));
    return {
      id: 'notificationLatency',
      kind: 'latency-table',
      rows,
      ariaLabel: 'Latencia promedio de notificación por banco',
    };
  }

  private latencyCell(ms: number | null, sampleCount: number): LatencyMetricCell {
    return { formatted: ms === null ? 'Sin datos' : this.formatDuration(ms), sampleCount };
  }

  /** Escala automáticamente la unidad (s/min/h/d) para que el número siga siendo legible en cualquier orden de magnitud. */
  private formatDuration(ms: number): string {
    const seconds = ms / 1000;
    if (seconds < 90) return `${Math.round(seconds)} s`;
    const minutes = seconds / 60;
    if (minutes < 90) return `${Math.round(minutes)} min`;
    const hours = minutes / 60;
    if (hours < 48) return `${Math.round(hours)} h`;
    const days = hours / 24;
    return `${days.toFixed(1)} d`;
  }

  // --- Opciones / colores ----------------------------------------------------

  // Colores, cuadrícula, ejes y fuente los pone yep-chart-canvas desde los
  // tokens `--chart-*` (y cambian con el tema): aquí solo la forma.
  private barOptions(): ChartOptions {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { maxTicksLimit: 4 } },
      },
    };
  }

  private horizontalBarOptions(): ChartOptions {
    const options: ChartOptions<'bar'> = {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { maxTicksLimit: 4 } },
        y: { grid: { display: false } },
      },
    };
    return options as ChartOptions;
  }

  private lineOptions(): ChartOptions {
    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { maxTicksLimit: 4 } },
      },
    };
    return options as ChartOptions;
  }

  /**
   * % de mezcla para una celda: 0 si está realmente vacía, si no un piso de
   * 30% (para que "hubo actividad" ya se note contra el fondo, en vez de un
   * tinte casi imperceptible) escalado hasta 100% en la celda más activa.
   */
  private heatmapIntensity(count: number, maxCount: number): number {
    if (count === 0 || maxCount === 0) {
      return 0;
    }
    const HEATMAP_MIN_PCT = 30;
    return Math.round(HEATMAP_MIN_PCT + (count / maxCount) * (100 - HEATMAP_MIN_PCT));
  }

  /**
   * Color de celda del mapa de calor: mezcla la serie principal (`--chart-1`)
   * con la superficie atenuada según la intensidad. Solo tokens, así que la
   * celda cambia con el tema sin recalcular.
   */
  heatmapCellColor(colorPct: number): string {
    return `color-mix(in srgb, var(--chart-1) ${colorPct}%, var(--color-surface-muted))`;
  }

  /** Hora en formato 12h compacto (ej. "12a", "3p") en vez de la hora militar 0-23. */
  hourLabel(hour: number): string {
    const period = hour < 12 ? 'a' : 'p';
    const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${twelveHour}${period}`;
  }

  /** Etiqueta del encabezado: vacía salvo cada HOUR_LABEL_STEP horas, para no saturar 24 columnas. */
  hourHeaderLabel(hour: number): string {
    return hour % HOUR_LABEL_STEP === 0 ? this.hourLabel(hour) : '';
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
