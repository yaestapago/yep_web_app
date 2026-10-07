import type { BillingBlockReason, BillingPeriod } from '../models/billing-status.models';

/** Las fechas de cobro (corte, cambio de ciclo) son días de Colombia. */
export const BILLING_TIME_ZONE = 'America/Bogota';

const COP_FORMATTER = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const BOGOTA_LONG_DATE_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: BILLING_TIME_ZONE,
});
const BOGOTA_ISO_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: BILLING_TIME_ZONE,
});
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Valor en pesos con separador de miles colombiano: `$90.000`. */
export function formatCopAmount(value: number | null | undefined): string {
  return `$${COP_FORMATTER.format(Math.round(value ?? 0))}`;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `5 de octubre de 2026`; cadena vacía si no hay fecha válida. */
export function formatLongDate(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? LONG_DATE_FORMATTER.format(date) : '';
}

/**
 * `5 de octubre de 2026` en hora de Bogotá (la fecha de corte llega como
 * 00:00 de Bogotá = 05:00 UTC); cadena vacía si no hay fecha válida.
 */
export function formatBogotaLongDate(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? BOGOTA_LONG_DATE_FORMATTER.format(date) : '';
}

/** Día en Bogotá como `YYYY-MM-DD` (por defecto, hoy). Cadena vacía si la fecha no es válida. */
export function bogotaIsoDate(value: Date | string = new Date()): string {
  const date = typeof value === 'string' ? parseDate(value) : value;
  if (!date || Number.isNaN(date.getTime())) return '';
  const parts = BOGOTA_ISO_PARTS_FORMATTER.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** `Mensual` / `Anual`. */
export function billingPeriodLabel(period: BillingPeriod | null | undefined): string {
  return period === 'annual' ? 'Anual' : 'Mensual';
}

/** `mensual` / `anual`, para usar dentro de una frase. */
export function billingPeriodWord(period: BillingPeriod | null | undefined): string {
  return period === 'annual' ? 'anual' : 'mensual';
}

/** `5 oct 2026`; cadena vacía si no hay fecha válida. */
export function formatShortDate(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? SHORT_DATE_FORMATTER.format(date) : '';
}

/** `5 oct 2026, 9:30 a. m.`; cadena vacía si no hay fecha válida. */
export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? DATE_TIME_FORMATTER.format(date) : '';
}

/** `hoy`, `1 día`, `3 días`. */
export function formatDaysLeft(days: number): string {
  if (days <= 0) return 'hoy';
  return days === 1 ? '1 día' : `${days} días`;
}

/** Motivo del bloqueo en lenguaje de usuario (tuteo, como el resto de la app). */
export function blockReasonLabel(reason: BillingBlockReason | string | null | undefined): string {
  switch (reason) {
    case 'trial_ended':
      return 'Tu prueba gratis terminó.';
    case 'payment_overdue':
      return 'La cuenta de cobro de tu suscripción está vencida.';
    case 'subscription_ended':
      return 'Tu suscripción terminó.';
    default:
      return 'Tu suscripción tiene un pago pendiente.';
  }
}
