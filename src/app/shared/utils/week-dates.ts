import type { DayOfWeek } from '../models/schedule.models';

/**
 * Utilidades puras de fecha para proyectar la plantilla semanal recurrente de
 * turnos (dayOfWeek, sin fechas) sobre una semana de calendario concreta.
 *
 * La semana empieza en LUNES (como las columnas de la vista) y termina en
 * domingo. Los `DayOfWeek` siguen la convención JS: 0 = domingo … 6 = sábado.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Lunes 00:00 (hora local) de la semana que contiene `date`. */
export function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay(); // 0 = domingo … 6 = sábado
  const diffToMonday = (day + 6) % 7; // domingo → 6, lunes → 0, …
  result.setDate(result.getDate() - diffToMonday);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

/**
 * Fecha concreta de un `dayOfWeek` dentro de la semana lunes-domingo que
 * empieza en `weekStart` (que debe ser un lunes, de `startOfWeek`).
 */
export function dateForDayOfWeek(weekStart: Date, dayOfWeek: DayOfWeek): Date {
  const offsetFromMonday = (dayOfWeek + 6) % 7; // lunes → 0, …, domingo → 6
  return addDays(weekStart, offsetFromMonday);
}

/** Compara dos fechas ignorando la hora (mismo día local). */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** True si `weekStart` corresponde a la semana que contiene a `reference` (hoy). */
export function isSameWeek(weekStart: Date, reference: Date): boolean {
  return isSameDay(weekStart, startOfWeek(reference));
}

/** Día del mes como string, p.ej. "29". */
export function formatDayShort(date: Date): string {
  return String(date.getDate());
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('es-CO', { month: 'long' });
const MONTH_SHORT_FORMATTER = new Intl.DateTimeFormat('es-CO', { month: 'short' });

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Título del mes para la semana lunes-domingo que empieza en `weekStart`.
 * - Un solo mes: "Julio 2026".
 * - Cruce de meses (mismo año): "Jun – Jul 2026".
 * - Cruce de año: "Dic 2026 – Ene 2027".
 */
export function formatMonthTitle(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();

  if (sameMonth && sameYear) {
    return `${capitalize(MONTH_FORMATTER.format(weekStart))} ${weekStart.getFullYear()}`;
  }

  const startMonth = capitalize(MONTH_SHORT_FORMATTER.format(weekStart));
  const endMonth = capitalize(MONTH_SHORT_FORMATTER.format(weekEnd));

  if (sameYear) {
    return `${startMonth} – ${endMonth} ${weekStart.getFullYear()}`;
  }

  return `${startMonth} ${weekStart.getFullYear()} – ${endMonth} ${weekEnd.getFullYear()}`;
}

/** Días de diferencia (en semanas completas) entre dos lunes. Útil para tests. */
export function weeksBetween(from: Date, to: Date): number {
  return Math.round((startOfWeek(to).getTime() - startOfWeek(from).getTime()) / (MS_PER_DAY * 7));
}
