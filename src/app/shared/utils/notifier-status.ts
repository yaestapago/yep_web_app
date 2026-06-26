import { InjectionToken } from '@angular/core';

import type { Notifier } from '../models/notifier.models';

/**
 * Niveles del semáforo de un notifier basados en su último heartbeat.
 * - `online`: reportó dentro de la ventana esperada (verde).
 * - `delayed`: lleva un tiempo sin reportar pero aún no se considera caído (amarillo).
 * - `offline`: superó el tiempo máximo permitido (rojo).
 * - `unknown`: nunca reportó o no hay información suficiente (gris).
 */
export type NotifierStatusLevel = 'online' | 'delayed' | 'offline' | 'unknown';

/** Umbrales (en milisegundos) para pasar de verde → amarillo → rojo. */
export interface NotifierStatusThresholds {
  /** A partir de este tiempo sin heartbeat el estado pasa a `delayed` (amarillo). */
  delayedAfterMs: number;
  /** A partir de este tiempo sin heartbeat el estado pasa a `offline` (rojo). */
  offlineAfterMs: number;
  /** Cada cuánto se recalcula/refresca el estado en la UI. */
  refreshIntervalMs: number;
}

/**
 * Umbrales por defecto. El backend marca un notifier en línea durante 5 min
 * (ONLINE_WINDOW_MS), así que alineamos `delayedAfterMs` con esa ventana.
 */
export const DEFAULT_NOTIFIER_STATUS_THRESHOLDS: NotifierStatusThresholds = {
  delayedAfterMs: 5 * 60 * 1000, // 5 minutos → amarillo
  offlineAfterMs: 15 * 60 * 1000, // 15 minutos → rojo
  refreshIntervalMs: 30 * 1000, // refresco de UI cada 30 s
};

/**
 * Token configurable para inyectar/ajustar los umbrales sin esparcir valores
 * mágicos por tarjetas, tablas o dashboard.
 */
export const NOTIFIER_STATUS_THRESHOLDS = new InjectionToken<NotifierStatusThresholds>(
  'NOTIFIER_STATUS_THRESHOLDS',
  {
    providedIn: 'root',
    factory: () => DEFAULT_NOTIFIER_STATUS_THRESHOLDS,
  },
);

export interface NotifierStatus {
  level: NotifierStatusLevel;
  /** Texto accesible del estado (no depender solo del color). */
  label: string;
  /** Última vez que reportó, si existe. */
  lastSeenAt: string | null;
  /** Milisegundos transcurridos desde el último heartbeat (null si nunca reportó). */
  sinceMs: number | null;
}

const STATUS_LABELS: Record<NotifierStatusLevel, string> = {
  online: 'En línea',
  delayed: 'Con retraso',
  offline: 'Fuera de línea',
  unknown: 'Sin datos',
};

export function notifierStatusLabel(level: NotifierStatusLevel): string {
  return STATUS_LABELS[level];
}

/**
 * Calcula el estado de un notifier a partir de su último heartbeat.
 * Centralizar aquí evita duplicar la lógica en tarjetas, tablas y dashboard.
 */
export function computeNotifierStatus(
  notifier: Pick<Notifier, 'lastSeenAt' | 'active'>,
  thresholds: NotifierStatusThresholds = DEFAULT_NOTIFIER_STATUS_THRESHOLDS,
  now: number = Date.now(),
): NotifierStatus {
  const lastSeenAt = notifier.lastSeenAt ?? null;

  if (!lastSeenAt) {
    return { level: 'unknown', label: STATUS_LABELS.unknown, lastSeenAt: null, sinceMs: null };
  }

  const parsed = new Date(lastSeenAt).getTime();

  if (Number.isNaN(parsed)) {
    return { level: 'unknown', label: STATUS_LABELS.unknown, lastSeenAt, sinceMs: null };
  }

  const sinceMs = Math.max(0, now - parsed);
  const level: NotifierStatusLevel =
    sinceMs >= thresholds.offlineAfterMs
      ? 'offline'
      : sinceMs >= thresholds.delayedAfterMs
        ? 'delayed'
        : 'online';

  return { level, label: STATUS_LABELS[level], lastSeenAt, sinceMs };
}

/** Texto relativo simple y legible para el último heartbeat. */
export function relativeFromMs(sinceMs: number | null): string {
  if (sinceMs === null) {
    return 'nunca';
  }

  const seconds = Math.floor(sinceMs / 1000);
  if (seconds < 60) {
    return 'hace unos segundos';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `hace ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
