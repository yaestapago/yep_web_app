import { TestBed } from '@angular/core/testing';
import { Chart, type ChartData, type ChartOptions } from 'chart.js';

import { ChartCanvas } from './chart-canvas';
import { readChartPalette, themeChartOptions, type ChartPalette } from './chart-theme';

// Los valores de los tokens son marcadores de texto (no colores reales): la
// prueba comprueba de dónde sale cada valor, no el color en sí.
const TOKENS_CSS = `
  :root {
    --chart-1: claro-1; --chart-2: claro-2; --chart-3: claro-3; --chart-4: claro-4;
    --chart-grid: claro-grid; --chart-axis: claro-axis;
    --color-surface: claro-surface; --color-border: claro-border;
    --color-text-primary: claro-text; --font-family-base: fuente-base;
  }
  :root[data-theme='dark'] {
    --chart-1: oscuro-1; --chart-2: oscuro-2; --chart-3: oscuro-3; --chart-4: oscuro-4;
    --chart-grid: oscuro-grid; --chart-axis: oscuro-axis;
    --color-surface: oscuro-surface; --color-border: oscuro-border;
    --color-text-primary: oscuro-text;
  }
`;

type AnyRecord = Record<string, any>;

describe('ChartCanvas', () => {
  let style: HTMLStyleElement;
  let update: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    style = document.createElement('style');
    style.textContent = TOKENS_CSS;
    document.head.appendChild(style);
    delete document.documentElement.dataset['theme'];

    // jsdom no tiene canvas 2D: Chart se crea sin contexto y se neutralizan
    // `update`/`destroy`, que necesitarían dibujar.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    update = vi.spyOn(Chart.prototype, 'update').mockImplementation(() => undefined);
    vi.spyOn(Chart.prototype, 'destroy').mockImplementation(() => undefined);
  });

  afterEach(() => {
    style.remove();
    delete document.documentElement.dataset['theme'];
    vi.restoreAllMocks();
  });

  async function create(options: ChartOptions = {}, data?: ChartData) {
    await TestBed.configureTestingModule({ imports: [ChartCanvas] }).compileComponents();
    const fixture = TestBed.createComponent(ChartCanvas);
    fixture.componentRef.setInput('type', 'bar');
    fixture.componentRef.setInput('data', data ?? { labels: ['a'], datasets: [{ data: [1] }] });
    fixture.componentRef.setInput('options', options);
    fixture.detectChanges();
    await fixture.whenStable();
    const chart = () => (fixture.componentInstance as unknown as { chart: Chart }).chart;
    const options$ = () => chart().config.options as AnyRecord;
    return { fixture, chart, options: options$ };
  }

  it('reads the palette from the tokens', () => {
    expect(readChartPalette(document)).toEqual({
      series: ['claro-1', 'claro-2', 'claro-3', 'claro-4'],
      grid: 'claro-grid',
      axis: 'claro-axis',
      surface: 'claro-surface',
      border: 'claro-border',
      text: 'claro-text',
      fontFamily: 'fuente-base',
    });
  });

  it('applies token colors to series, grid, axes, tooltip and fonts', async () => {
    const { options } = await create();
    const opts = options();

    const series = opts['datasets'].bar.backgroundColor;
    expect(series({ datasetIndex: 0 })).toBe('claro-1');
    expect(series({ datasetIndex: 5 })).toBe('claro-2');
    expect(opts['scales'].x.grid.color).toBe('claro-grid');
    expect(opts['scales'].y.ticks.color).toBe('claro-axis');
    expect(opts['scales'].y.ticks.font).toEqual({ family: 'fuente-base', size: 12 });
    expect(opts['plugins'].tooltip).toMatchObject({
      backgroundColor: 'claro-surface',
      borderColor: 'claro-border',
      borderWidth: 1,
      titleColor: 'claro-text',
      bodyColor: 'claro-text',
    });
    expect(opts['font']).toEqual({ family: 'fuente-base' });
  });

  it('keeps colors passed explicitly by the screen', async () => {
    const input: ChartOptions = {
      scales: { y: { grid: { color: 'pantalla-grid' }, ticks: { font: { size: 10 } } } },
      plugins: { tooltip: { backgroundColor: 'pantalla-tooltip' } },
    };
    const data: ChartData = {
      labels: ['a'],
      datasets: [{ data: [1], backgroundColor: 'pantalla-serie' }],
    };
    const { options, chart } = await create(input, data);
    const opts = options();

    expect(opts['scales'].y.grid.color).toBe('pantalla-grid');
    expect(opts['scales'].y.ticks.font).toEqual({ family: 'fuente-base', size: 10 });
    expect(opts['plugins'].tooltip.backgroundColor).toBe('pantalla-tooltip');
    expect(opts['plugins'].tooltip.borderColor).toBe('claro-border');
    expect(chart().data).toBe(data);
    expect(input).toEqual({
      scales: { y: { grid: { color: 'pantalla-grid' }, ticks: { font: { size: 10 } } } },
      plugins: { tooltip: { backgroundColor: 'pantalla-tooltip' } },
    });
  });

  it('re-applies the palette and updates the chart when data-theme changes', async () => {
    const { fixture, options } = await create();
    update.mockClear();

    document.documentElement.dataset['theme'] = 'dark';
    await Promise.resolve(); // entrega del MutationObserver
    fixture.detectChanges();
    await fixture.whenStable();

    const opts = options();
    expect(update).toHaveBeenCalled();
    expect(opts['datasets'].bar.backgroundColor({ datasetIndex: 0 })).toBe('oscuro-1');
    expect(opts['scales'].x.grid.color).toBe('oscuro-grid');
    expect(opts['plugins'].tooltip.backgroundColor).toBe('oscuro-surface');
    expect(opts['font']).toEqual({ family: 'fuente-base' });
  });

  it('stops observing the theme after destroy', async () => {
    const { fixture } = await create();
    fixture.destroy();
    update.mockClear();

    document.documentElement.dataset['theme'] = 'dark';
    await Promise.resolve();

    expect(update).not.toHaveBeenCalled();
  });
});

describe('themeChartOptions', () => {
  const empty: ChartPalette = {
    series: [],
    grid: '',
    axis: '',
    surface: '',
    border: '',
    text: '',
    fontFamily: '',
  };

  it('omits defaults for undefined tokens', () => {
    const result = themeChartOptions('doughnut', {}, empty) as AnyRecord;

    expect(result['color']).toBeUndefined();
    expect(result['datasets'].doughnut.backgroundColor).toBeUndefined();
    expect(result['plugins'].tooltip).toEqual({ borderWidth: 1, titleFont: {}, bodyFont: {}, footerFont: {} });
    expect(result['scales']).toEqual({});
  });
});
