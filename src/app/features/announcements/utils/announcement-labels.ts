import type { StatusChipTone } from '../../../shared/ui/status-chip/status-chip';
import { formatDateTime, formatShortDate } from '../../../shared/utils/billing-format';
import type {
  Announcement,
  AnnouncementActionType,
  AnnouncementApp,
  AnnouncementAudience,
  AnnouncementCondition,
  AnnouncementPlatform,
  AnnouncementRepeat,
  AnnouncementRole,
  AnnouncementStatus,
  AnnouncementTone,
} from '../models/announcement.models';

export const APP_LABELS: Record<AnnouncementApp, string> = {
  notifier: 'Notificador',
  yep: 'App de YEP',
};

export type AppPreposition = '' | 'de' | 'a' | 'en' | 'para';

/**
 * El nombre de la app dentro de una frase, con su artículo y la contracción que pida la
 * preposición: «el Notificador», «del Notificador», «al Notificador», «en la App de YEP».
 */
export function appInSentence(app: AnnouncementApp, preposition: AppPreposition = ''): string {
  if (app === 'notifier') {
    if (preposition === 'de') return 'del Notificador';
    if (preposition === 'a') return 'al Notificador';
    return preposition ? `${preposition} el Notificador` : 'el Notificador';
  }
  return preposition ? `${preposition} la App de YEP` : 'la App de YEP';
}

export const PLATFORM_LABELS: Record<AnnouncementPlatform, string> = {
  android: 'Android',
  ios: 'iPhone',
};

export const STATUS_LABELS: Record<AnnouncementStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

export const STATUS_TONES: Record<AnnouncementStatus, StatusChipTone> = {
  draft: 'warning',
  published: 'success',
  archived: 'neutral',
};

export const TONE_LABELS: Record<AnnouncementTone, string> = {
  info: 'Informativo',
  success: 'Buena noticia',
  warning: 'Advertencia',
  danger: 'Urgente',
};

export const TONE_CHIP: Record<AnnouncementTone, StatusChipTone> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
};

export const ROLE_LABELS: Record<AnnouncementRole, string> = {
  account_owner: 'Dueños',
  account_staff: 'Empleados',
};

export const REPEAT_LABELS: Record<AnnouncementRepeat, string> = {
  once: 'Una sola vez',
  until_action: 'Hasta que toque el botón',
};

export const CONDITION_LABELS: Record<AnnouncementCondition, string> = {
  permission_missing: 'Sin permiso de notificaciones',
  listener_off: 'Escucha apagada',
  conversations_blocked: '«Conversaciones» bloqueado',
  sms_hidden: 'SMS del banco ocultos por Android',
  notifications_blocked: 'Notificaciones de YEP apagadas',
  battery_restricted: 'Batería restringida',
};

/** Qué tiene que pasar en el celular para que el anuncio automático salga. */
export const CONDITION_HINTS: Record<AnnouncementCondition, string> = {
  permission_missing: 'YEP no tiene permiso para leer las notificaciones.',
  listener_off: 'Tiene el permiso, pero Android apagó la escucha de YEP.',
  conversations_blocked: 'Android no le entrega a YEP los SMS del banco.',
  sms_hidden:
    'Android le oculta a YEP los SMS del banco porque el número no está en los contactos (últimas 72 h).',
  notifications_blocked: 'Las notificaciones de YEP están apagadas en el celular.',
  battery_restricted: 'Android le restringe la batería a YEP.',
};

export const ACTION_LABELS: Record<AnnouncementActionType, string> = {
  update_app: 'Actualizar la app',
  open_url: 'Abrir un enlace',
  open_route: 'Abrir una pantalla de la app',
  open_notification_access: 'Abrir Acceso a notificaciones',
  open_conversations_settings: 'Abrir el ajuste «Conversaciones»',
  save_bank_contact: 'Guardar contacto del banco',
  open_autostart_settings: 'Abrir Inicio automático',
  open_battery_settings: 'Quitar la restricción de batería',
  open_app_notification_settings: 'Abrir las notificaciones de YEP',
  run_self_test: 'Hacer la prueba de escucha',
  open_diagnostics: 'Abrir Diagnóstico de escucha',
};

/** Acciones que entiende cada app (contrato · «Acciones»). */
export const ACTIONS_BY_APP: Record<AnnouncementApp, readonly AnnouncementActionType[]> = {
  notifier: [
    'update_app',
    'open_url',
    'open_notification_access',
    'open_conversations_settings',
    'save_bank_contact',
    'open_autostart_settings',
    'open_battery_settings',
    'open_app_notification_settings',
    'run_self_test',
    'open_diagnostics',
  ],
  yep: ['update_app', 'open_url', 'open_route'],
};

export function isActionAllowed(app: AnnouncementApp, type: string | null | undefined): boolean {
  return !!type && (ACTIONS_BY_APP[app] as readonly string[]).includes(type);
}

/** Texto del botón de cerrar que pinta el cliente (`dismissLabel` del contrato). */
export function dismissLabelFor(repeat: AnnouncementRepeat): string {
  return repeat === 'once' ? 'Cerrar' : 'Más tarde';
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function versionRange(audience: AnnouncementAudience): string | null {
  const min = audience.minVersion?.trim();
  const max = audience.maxVersion?.trim();
  if (min && max) return min === max ? `versión ${min}` : `versiones ${min} a ${max}`;
  if (min) return `desde la versión ${min}`;
  if (max) return `hasta la versión ${max}`;
  return null;
}

/**
 * Resumen legible de a quién va un anuncio ("Automático: escucha apagada",
 * "Todos los celulares del Notificador", "3 negocios · Dueños · iPhone").
 */
export function audienceSummary(app: AnnouncementApp, audience: AnnouncementAudience): string {
  const parts: string[] = [];
  const accounts = audience.accountIds?.length ?? 0;
  if (accounts) parts.push(plural(accounts, 'negocio', 'negocios'));

  if (app === 'notifier') {
    const notifiers = audience.notifierIds?.length ?? 0;
    if (notifiers) parts.push(plural(notifiers, 'celular', 'celulares'));
  } else {
    const users = audience.userIds?.length ?? 0;
    if (users) parts.push(plural(users, 'usuario', 'usuarios'));
    const roles = audience.roles ?? [];
    if (roles.length === 1) parts.push(`Solo ${ROLE_LABELS[roles[0]].toLowerCase()}`);
    const platforms = audience.platforms ?? [];
    if (platforms.length === 1) parts.push(`Solo ${PLATFORM_LABELS[platforms[0]]}`);
  }

  const range = versionRange(audience);
  if (range) parts.push(range);

  if (app === 'notifier' && audience.condition) {
    const base = `Automático: ${lowerFirst(CONDITION_LABELS[audience.condition])}`;
    return parts.length ? `${base} · ${parts.join(' · ')}` : base;
  }

  if (parts.length === 0) {
    return app === 'notifier'
      ? 'Todos los celulares del Notificador'
      : 'Todos los usuarios de la App de YEP';
  }
  return parts.join(' · ');
}

function lowerFirst(text: string): string {
  // Respeta las comillas de «Conversaciones» y las siglas o nombres propios (SMS, YEP).
  if (text.startsWith('«') || /^[A-Z]{2,}\b/.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

const COMPACT_DATE = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
const COMPACT_DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** `14 oct, 8:28 p. m.` (con año solo si no es el actual); cadena vacía si no hay fecha válida. */
export function formatCompactDateTime(
  value: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.getFullYear() === now.getFullYear()
    ? COMPACT_DATE_TIME.format(date)
    : formatDateTime(value);
}

/** `13 oct` (con año solo si no es el actual); cadena vacía si no hay fecha válida. */
export function formatCompactDate(
  value: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.getFullYear() === now.getFullYear()
    ? COMPACT_DATE.format(date)
    : formatShortDate(value);
}

/** Ventana de entrega en una línea ("Desde 5 oct", "13 oct – 24 oct", "Sin fecha límite"). */
export function windowLabel(
  announcement: Pick<Announcement, 'startsAt' | 'endsAt'>,
  now: Date = new Date(),
): string {
  const start = formatCompactDate(announcement.startsAt, now);
  const end = formatCompactDate(announcement.endsAt, now);
  if (start && end) return `${start} – ${end}`;
  if (start) return `Desde ${start}`;
  if (end) return `Hasta ${end}`;
  return 'Sin fecha límite';
}

export type WindowPhase = 'pending' | 'active' | 'ended' | 'open';

/** Dónde está "ahora" respecto a la ventana de entrega. */
export function windowPhase(
  announcement: Pick<Announcement, 'startsAt' | 'endsAt'>,
  now: Date = new Date(),
): WindowPhase {
  const start = announcement.startsAt ? new Date(announcement.startsAt) : null;
  const end = announcement.endsAt ? new Date(announcement.endsAt) : null;
  if (end && !Number.isNaN(end.getTime()) && end.getTime() <= now.getTime()) return 'ended';
  if (start && !Number.isNaN(start.getTime()) && start.getTime() > now.getTime()) return 'pending';
  return start || end ? 'active' : 'open';
}

/** Nota de estado para un publicado fuera de su ventana ("Empieza el …" / "Ya terminó"). */
export function statusNote(announcement: Announcement, now: Date = new Date()): string {
  if (announcement.status !== 'published') return '';
  const phase = windowPhase(announcement, now);
  if (phase === 'pending') return `Empieza el ${formatDateTime(announcement.startsAt)}`;
  if (phase === 'ended') return 'Ya terminó: no se entrega';
  return '';
}

export function sourceLabel(announcement: Pick<Announcement, 'source'>): string {
  return announcement.source === 'system' ? 'Automático' : 'Manual';
}

/** Cifras con punto de miles (formato colombiano). */
export function formatCount(value: number | null | undefined): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value ?? 0);
}
