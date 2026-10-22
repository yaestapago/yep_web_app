import type { StatusChipTone } from '../../../shared/ui/status-chip/status-chip';
import type { AssistantIncidentKind } from '../models/assistant-admin.models';

export const INCIDENT_LABELS: Record<AssistantIncidentKind, string> = {
  injection_suspect: 'Posible manipulación',
  sensitive_shared: 'Compartió datos sensibles',
  tool_denied: 'Pidió datos de dueño',
  no_answer: 'Sin respuesta',
  budget_reached: 'Llegó al tope',
  long_conversation: 'Conversación larga',
};

/** Rojo solo para lo que más hay que mirar (intento de manipulación). */
export const INCIDENT_TONES: Record<AssistantIncidentKind, StatusChipTone> = {
  injection_suspect: 'error',
  sensitive_shared: 'warning',
  tool_denied: 'warning',
  no_answer: 'neutral',
  budget_reached: 'info',
  long_conversation: 'neutral',
};

/** Herramientas de Zaira en palabras del panel. */
export const TOOL_LABELS: Record<string, string> = {
  ver_notificadores: 'notificadores',
  ver_pagos_recientes: 'pagos recientes',
  ver_suscripcion: 'suscripción',
  ver_equipo: 'equipo',
  ver_alertas_whatsapp: 'alertas de WhatsApp',
};

export function toolLabel(name: string | undefined): string {
  if (!name) return 'herramienta';
  return TOOL_LABELS[name] ?? name;
}

const COP = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const COLOMBIA_DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** "$ 1.234" (formato colombiano, sin decimales). */
export function formatCop(value: number | null | undefined): string {
  return `$ ${COP.format(Math.round(value ?? 0))}`;
}

export function formatCount(value: number | null | undefined): string {
  return COP.format(value ?? 0);
}

/** "21 oct, 3:05 p. m." en hora de Colombia. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : COLOMBIA_DATE_TIME.format(date);
}

/** "octubre de 2026" para `2026-10`. */
export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat('es-CO', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 15)));
}
