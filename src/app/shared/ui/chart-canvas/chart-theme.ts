import type { ChartOptions, ChartType, ScriptableContext } from 'chart.js';

/**
 * Paleta de gráficas leída de los tokens CSS (`--chart-*`, `--color-*`,
 * `--font-family-base`). Ningún color vive en código: si un token no está
 * definido, su valor queda vacío y no se aplica como valor por defecto.
 */
export interface ChartPalette {
  series: string[];
  grid: string;
  axis: string;
  surface: string;
  border: string;
  text: string;
  fontFamily: string;
}

const SERIES_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4'] as const;
const AXIS_FONT_SIZE = 12;

/** Lee la paleta con `getComputedStyle(document.documentElement)`. */
export function readChartPalette(doc: Document): ChartPalette {
  const root = doc.documentElement;
  const styles = doc.defaultView?.getComputedStyle(root);
  const read = (name: string) => styles?.getPropertyValue(name).trim() ?? '';

  return {
    series: SERIES_TOKENS.map(read).filter((value) => value !== ''),
    grid: read('--chart-grid'),
    axis: read('--chart-axis'),
    surface: read('--color-surface'),
    border: read('--color-border'),
    text: read('--color-text-primary'),
    fontFamily: read('--font-family-base'),
  };
}

/**
 * Devuelve las opciones de la pantalla completadas con la paleta. Lo que la
 * pantalla pasa explícitamente siempre gana (fusión profunda, la pantalla
 * encima). No modifica `options`.
 */
export function themeChartOptions(
  type: ChartType,
  options: ChartOptions,
  palette: ChartPalette,
): ChartOptions {
  return mergeDefaults(buildDefaults(type, options, palette), options) as ChartOptions;
}

function buildDefaults(type: ChartType, options: ChartOptions, palette: ChartPalette) {
  const { series, grid, axis, surface, border, text, fontFamily } = palette;
  const font = { family: fontFamily };
  const axisFont = { family: fontFamily, size: AXIS_FONT_SIZE };

  // Colores de serie como opciones de tipo de dataset: un color puesto en el
  // propio dataset tiene prioridad sobre estas, así que no se pisan.
  const byDataset = series.length
    ? (ctx: ScriptableContext<ChartType>) => series[ctx.datasetIndex % series.length]
    : undefined;
  const byDataIndex = series.length
    ? (ctx: ScriptableContext<ChartType>) => series[ctx.dataIndex % series.length]
    : undefined;

  const scaleDefaults = {
    grid: { color: grid },
    border: { color: grid },
    ticks: { color: axis, font: axisFont },
  };
  const radialDefaults = {
    ...scaleDefaults,
    angleLines: { color: grid },
    pointLabels: { color: axis, font: axisFont },
    ticks: { color: axis, font: axisFont, backdropColor: surface },
  };

  const scales: Record<string, unknown> = {};
  const scaleIds = new Set(Object.keys(options.scales ?? {}));
  if (isCartesian(type)) {
    scaleIds.add('x').add('y');
  } else if (type === 'radar' || type === 'polarArea') {
    scaleIds.add('r');
  }
  for (const id of scaleIds) {
    scales[id] = id === 'r' ? radialDefaults : scaleDefaults;
  }

  return prune({
    color: axis,
    borderColor: grid,
    font,
    datasets: {
      bar: { backgroundColor: byDataset, borderColor: byDataset },
      line: { backgroundColor: byDataset, borderColor: byDataset },
      doughnut: { backgroundColor: byDataIndex, borderColor: surface },
      pie: { backgroundColor: byDataIndex, borderColor: surface },
    },
    scales,
    plugins: {
      legend: { labels: { color: axis, font } },
      // Tooltip plano: superficie, borde de 1 px y texto principal, sin sombra.
      tooltip: {
        backgroundColor: surface,
        borderColor: border,
        borderWidth: 1,
        titleColor: text,
        bodyColor: text,
        footerColor: text,
        titleFont: font,
        bodyFont: font,
        footerFont: font,
      },
    },
  });
}

function isCartesian(type: ChartType): boolean {
  return type === 'bar' || type === 'line' || type === 'scatter' || type === 'bubble';
}

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Quita valores vacíos (token no definido) para que Chart.js use los suyos. */
function prune(value: PlainObject): PlainObject {
  const result: PlainObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === '') continue;
    result[key] = isPlainObject(entry) ? prune(entry) : entry;
  }
  return result;
}

/** Fusión profunda en un objeto nuevo; `overrides` gana sobre `defaults`. */
function mergeDefaults(defaults: unknown, overrides: unknown): unknown {
  if (overrides === undefined) return defaults;
  if (!isPlainObject(defaults) || !isPlainObject(overrides)) return overrides;

  const result: PlainObject = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    result[key] = mergeDefaults(defaults[key], value);
  }
  return result;
}
