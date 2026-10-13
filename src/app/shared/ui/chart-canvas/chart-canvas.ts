import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input as defineInput,
  signal,
  viewChild,
} from '@angular/core';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartData,
  type ChartOptions,
  type ChartType,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

import { readChartPalette, themeChartOptions } from './chart-theme';

// Registro único de los controladores/elementos que el panel usa (dona, barras
// y líneas). Evitamos `registerables` completo para no inflar el bundle.
Chart.register(
  DoughnutController,
  ArcElement,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
);

/**
 * Envoltura mínima de Chart.js sobre un `<canvas>`. No depende de ningún wrapper
 * de Angular (compatibilidad con Angular 21). Crea, actualiza y destruye el
 * gráfico de forma reactiva a partir de inputs señal.
 *
 * El alto/ancho los controla el contenedor (`maintainAspectRatio: false`), así
 * que el `:host` debe tener una altura definida por su zona del panel.
 *
 * Colores y fuentes salen de los tokens (`--chart-*`, `--color-*`,
 * `--font-family-base`) como valores por defecto; lo que la pantalla pase en
 * `data`/`options` gana. Al cambiar `data-theme` en `<html>` se relee la paleta
 * y se actualiza el gráfico.
 */
@Component({
  selector: 'yep-chart-canvas',
  template: '<canvas #canvas [attr.aria-label]="ariaLabel()" role="img"></canvas>',
  styleUrl: './chart-canvas.scss',
})
export class ChartCanvas {
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  readonly type = defineInput.required<ChartType>();
  readonly data = defineInput.required<ChartData>();
  readonly options = defineInput<ChartOptions>({});
  readonly ariaLabel = defineInput<string>('');

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;
  private chartType: ChartType | null = null;
  private readonly palette = signal(readChartPalette(this.document));

  constructor() {
    this.observeTheme();

    effect(() => {
      const canvas = this.canvasRef().nativeElement;
      const type = this.type();
      const data = this.data();
      const options = themeChartOptions(type, this.options(), this.palette());

      // Mismo tipo: actualiza en sitio (animación suave). Tipo distinto: hay que
      // recrear el gráfico, ya que Chart.js no permite cambiar el tipo en vivo.
      if (this.chart && this.chartType === type) {
        this.chart.data = data;
        this.chart.options = options;
        this.chart.update();
        return;
      }

      this.chart?.destroy();
      this.chartType = type;
      this.chart = new Chart(canvas, { type, data, options });
    });

    this.destroyRef.onDestroy(() => {
      this.chart?.destroy();
      this.chart = null;
    });
  }

  /** Relee la paleta cuando el tema cambia (`<html data-theme>`). */
  private observeTheme(): void {
    const Observer = this.document.defaultView?.MutationObserver;
    if (!Observer) return;

    const observer = new Observer(() => this.palette.set(readChartPalette(this.document)));
    observer.observe(this.document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
