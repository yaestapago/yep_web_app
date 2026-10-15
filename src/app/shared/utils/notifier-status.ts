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
  /**
   * Si el servicio que captura está vivo (app ≥ 1.0.6). `null` cuando la app
   * no lo reporta: solo se sabe que "late".
   */
  listening: boolean | null;
}

const STATUS_LABELS: Record<NotifierStatusLevel, string> = {
  online: 'En línea',
  delayed: 'Con retraso',
  offline: 'Fuera de línea',
  unknown: 'Sin datos',
};

/** Late (verde por heartbeat) pero el servicio que captura está muerto. */
export const NOT_LISTENING_LABEL = 'En línea, sin escuchar';

/**
 * Late y el servicio corre, pero Android desenlazó el servicio que lee
 * notificaciones (`capture.listenerConnected === false`, app ≥ 1.0.8). El
 * celular está sordo aunque "parezca" vivo: hay que reconectar el acceso.
 */
export const NOT_LISTENING_NO_ACCESS_LABEL = 'En línea, sin acceso a notificaciones';

/**
 * Late y escucha, pero Android no le entrega a YEP las notificaciones de tipo
 * conversación (`capture.conversationsAllowed === false`, app ≥ 1.0.9): ahí
 * caen los SMS de Google Messages, así que los pagos que llegan por SMS no se
 * capturan. Se arregla activando «Conversaciones» para YEP en el celular.
 */
export const NOT_LISTENING_SMS_LABEL = 'En línea, sin acceso a los SMS';

/** Verde de verdad: late Y captura. */
export const LISTENING_LABEL = 'Escuchando';

export function notifierStatusLabel(level: NotifierStatusLevel): string {
  return STATUS_LABELS[level];
}

/** Lo que `computeNotifierStatus` necesita de un notifier. */
export type NotifierStatusInput = Pick<Notifier, 'lastSeenAt' | 'active'> &
  Partial<Pick<Notifier, 'lastCaptureAliveAt' | 'runtimeConfig' | 'capture'>>;

/**
 * Umbrales efectivos para un notifier: si tiene cadencias propias (heartbeat
 * espaciado), el backend deriva una ventana "en línea" mayor y aquí se respeta,
 * para no pintar amarillo/rojo entre dos latidos sanos. Nunca más estrictos
 * que los de flota.
 */
export function effectiveThresholds(
  notifier: Pick<NotifierStatusInput, 'runtimeConfig'>,
  thresholds: NotifierStatusThresholds,
): NotifierStatusThresholds {
  const windowSeconds = notifier.runtimeConfig?.onlineWindowSeconds;
  if (!windowSeconds || !Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    return thresholds;
  }
  const windowMs = windowSeconds * 1000;
  return {
    ...thresholds,
    delayedAfterMs: Math.max(thresholds.delayedAfterMs, windowMs),
    offlineAfterMs: Math.max(thresholds.offlineAfterMs, windowMs * 3),
  };
}

/**
 * Calcula el estado de un notifier a partir de su último heartbeat y, cuando
 * la app lo reporta, de si el servicio que captura sigue vivo. "Verde" solo
 * cuando late Y escucha: un celular que late por el respaldo de WorkManager
 * con la captura muerta queda en amarillo con un texto que lo dice.
 * Centralizar aquí evita duplicar la lógica en tarjetas, tablas y dashboard.
 */
export function computeNotifierStatus(
  notifier: NotifierStatusInput,
  thresholds: NotifierStatusThresholds = DEFAULT_NOTIFIER_STATUS_THRESHOLDS,
  now: number = Date.now(),
): NotifierStatus {
  const lastSeenAt = notifier.lastSeenAt ?? null;
  const effective = effectiveThresholds(notifier, thresholds);

  if (!lastSeenAt) {
    return {
      level: 'unknown',
      label: STATUS_LABELS.unknown,
      lastSeenAt: null,
      sinceMs: null,
      listening: null,
    };
  }

  const parsed = new Date(lastSeenAt).getTime();

  if (Number.isNaN(parsed)) {
    return {
      level: 'unknown',
      label: STATUS_LABELS.unknown,
      lastSeenAt,
      sinceMs: null,
      listening: null,
    };
  }

  const sinceMs = Math.max(0, now - parsed);
  let level: NotifierStatusLevel =
    sinceMs >= effective.offlineAfterMs
      ? 'offline'
      : sinceMs >= effective.delayedAfterMs
        ? 'delayed'
        : 'online';
  let label = STATUS_LABELS[level];

  const listening = computeListening(notifier.lastCaptureAliveAt, effective, now);
  // Android no le entrega los SMS a YEP: amarillo aunque el servicio escuche.
  const smsBlocked = notifier.capture?.conversationsAllowed === false;
  if (level === 'online' && (listening === false || smsBlocked)) {
    level = 'delayed';
    // Si la app ya reporta el enlace del listener y dice que Android lo soltó,
    // el texto apunta a la causa real (no es el servicio: es el acceso). Con el
    // servicio muerto no se oye nada, así que eso manda sobre los SMS.
    label =
      notifier.capture?.listenerConnected === false
        ? NOT_LISTENING_NO_ACCESS_LABEL
        : listening === false
          ? NOT_LISTENING_LABEL
          : NOT_LISTENING_SMS_LABEL;
  } else if (level === 'online' && listening === true) {
    label = LISTENING_LABEL;
  }

  return { level, label, lastSeenAt, sinceMs, listening };
}

function computeListening(
  lastCaptureAliveAt: string | null | undefined,
  thresholds: NotifierStatusThresholds,
  now: number,
): boolean | null {
  if (lastCaptureAliveAt === undefined || lastCaptureAliveAt === null) {
    return null;
  }
  const parsed = new Date(lastCaptureAliveAt).getTime();
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, now - parsed) < thresholds.delayedAfterMs;
}

const EMAIL_STATUS_LABELS = {
  online: 'Recibiendo correos',
  offline: 'Sin monitoreo de correo',
} as const;

/**
 * Los notificadores de correo (`email_gmail`) nunca envían heartbeat, así que
 * `computeNotifierStatus` no aplica: su salud depende de si Gmail (watch +
 * credenciales) está disponible, algo que ya calcula el backend y expone
 * como alerta `gmail_credentials` en el resumen del dashboard.
 */
export function emailNotifierStatus(channelDown: boolean): NotifierStatus {
  const level: NotifierStatusLevel = channelDown ? 'offline' : 'online';
  return {
    level,
    label: EMAIL_STATUS_LABELS[level],
    lastSeenAt: null,
    sinceMs: null,
    listening: null,
  };
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
