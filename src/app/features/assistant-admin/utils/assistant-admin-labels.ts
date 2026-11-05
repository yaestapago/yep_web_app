import type { StatusChipTone } from '../../../shared/ui/status-chip/status-chip';
import type { AssistantIncidentKind, AssistantTurnOutcome } from '../models/assistant-admin.models';

export const INCIDENT_LABELS: Record<AssistantIncidentKind, string> = {
  injection_suspect: 'Posible manipulación',
  sensitive_shared: 'Compartió datos sensibles',
  tool_denied: 'Pidió datos de dueño',
  no_answer: 'Sin respuesta',
  budget_reached: 'Llegó al tope',
  long_conversation: 'Conversación larga',
  bad_feedback: 'Respuesta mal calificada',
  output_guard: 'Filtro final',
  escalated: 'Escaló a soporte',
};

/** Rojo solo para lo que más hay que mirar (intento de manipulación). */
export const INCIDENT_TONES: Record<AssistantIncidentKind, StatusChipTone> = {
  injection_suspect: 'error',
  sensitive_shared: 'warning',
  tool_denied: 'warning',
  no_answer: 'neutral',
  budget_reached: 'info',
  long_conversation: 'neutral',
  bad_feedback: 'warning',
  output_guard: 'warning',
  escalated: 'info',
};

export const TURN_OUTCOME_LABELS: Record<AssistantTurnOutcome, string> = {
  guide: 'Guía del menú',
  answer: 'Respondió',
  no_answer: 'Sin respuesta',
  budget_reached: 'Llegó al tope',
  cancelled: 'Se canceló',
  error: 'Error',
};

export const TURN_OUTCOME_TONES: Record<AssistantTurnOutcome, StatusChipTone> = {
  guide: 'neutral',
  answer: 'success',
  no_answer: 'warning',
  budget_reached: 'info',
  cancelled: 'neutral',
  error: 'error',
};

/** Herramientas de Zaira en palabras del panel. Copia de los nombres de `backend/src/assistant/tools`. */
export const TOOL_LABELS: Record<string, string> = {
  ver_pagos_recientes: 'pagos recientes',
  buscar_pago: 'búsqueda de un pago',
  verificar_comprobante: 'verificación de comprobante',
  ver_por_revisar: 'pagos por revisar',
  ver_ventas: 'ventas',
  ver_tendencias: 'tendencias',
  diagnosticar_correo: 'diagnóstico de correo',
  ver_notificadores: 'notificadores',
  ver_suscripcion: 'suscripción',
  ver_equipo: 'equipo',
  ver_alertas_whatsapp: 'alertas de WhatsApp',
  ver_cuentas: 'cuentas bancarias',
  ver_configuracion: 'configuración',
  ver_mi_acceso: 'acceso del usuario',
  ver_bancos_compatibles: 'bancos compatibles',
  leer_guia: 'guías',
};

export function toolLabel(name: string | undefined): string {
  if (!name) return 'herramienta';
  return TOOL_LABELS[name] ?? name;
}

/** "notificadores × 2, pagos recientes": el orden de la primera vez, sin repetir. */
export function formatTurnTools(tools: readonly string[] | null | undefined): string {
  if (!tools?.length) return '—';
  const counts = new Map<string, number>();
  for (const tool of tools) counts.set(tool, (counts.get(tool) ?? 0) + 1);
  return [...counts]
    .map(([tool, count]) => (count > 1 ? `${toolLabel(tool)} × ${count}` : toolLabel(tool)))
    .join(', ');
}

const COP = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const SECONDS = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
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

/** "850 ms" o "3,2 s". */
export function formatLatency(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${SECONDS.format(ms / 1000)} s`;
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
