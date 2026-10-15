import type {
  Announcement,
  AnnouncementAction,
  AnnouncementActionType,
  AnnouncementApp,
  AnnouncementAudience,
  AnnouncementCondition,
  AnnouncementPayload,
  AnnouncementPlatform,
  AnnouncementRepeat,
  AnnouncementRole,
  AnnouncementStatus,
  AnnouncementTone,
} from '../models/announcement.models';
import { DEFAULT_STORE_URLS } from '../models/announcement.models';
import { ACTIONS_BY_APP, APP_LABELS, isActionAllowed } from './announcement-labels';
import { compareAppVersions, isValidVersionInput } from './app-version';

/** Valor plano del formulario del editor (lo que ve y edita el superadmin). */
export interface AnnouncementFormValue {
  app: AnnouncementApp;
  tone: AnnouncementTone;
  title: string;
  body: string;
  /** `''` = sin botón. */
  actionType: AnnouncementActionType | '';
  actionLabel: string;
  actionUrl: string;
  actionRoute: string;
  dismissible: boolean;
  notify: boolean;
  repeat: AnnouncementRepeat;
  /** Texto del input numérico. */
  snoozeHours: string;
  priority: string;
  accountIds: string[];
  notifierIds: string[];
  userIds: string[];
  roles: AnnouncementRole[];
  platforms: AnnouncementPlatform[];
  minVersion: string;
  maxVersion: string;
  /** `''` = sin condición (anuncio manual). */
  condition: AnnouncementCondition | '';
  /** `datetime-local` (hora del navegador); `''` = sin fecha. */
  startsAt: string;
  endsAt: string;
}

export type AnnouncementFormField = keyof AnnouncementFormValue;
export type AnnouncementFormErrors = Partial<Record<AnnouncementFormField, string>>;

export const TITLE_MAX = 80;
export const BODY_MAX = 600;
export const ACTION_LABEL_MAX = 30;

/** Acciones que abren un enlace (`update_app` usa la ficha de la tienda). */
export function actionNeedsUrl(type: AnnouncementActionType | ''): boolean {
  return type === 'open_url' || type === 'update_app';
}

export function actionNeedsRoute(type: AnnouncementActionType | ''): boolean {
  return type === 'open_route';
}

/** Campos de audiencia que se muestran (y se envían) según la app. */
export function audienceFieldsFor(app: AnnouncementApp): {
  notifierIds: boolean;
  userIds: boolean;
  roles: boolean;
  platforms: boolean;
  condition: boolean;
  notify: boolean;
} {
  const notifier = app === 'notifier';
  return {
    notifierIds: notifier,
    condition: notifier,
    // La App de YEP ignora `notify` en v1 (sin notificaciones con la app cerrada).
    notify: notifier,
    userIds: !notifier,
    roles: !notifier,
    // El Notificador es siempre Android.
    platforms: !notifier,
  };
}

export function emptyAnnouncementForm(app: AnnouncementApp = 'notifier'): AnnouncementFormValue {
  return {
    app,
    tone: 'info',
    title: '',
    body: '',
    actionType: '',
    actionLabel: '',
    actionUrl: '',
    actionRoute: '',
    dismissible: true,
    notify: false,
    repeat: 'once',
    snoozeHours: '24',
    priority: '50',
    accountIds: [],
    notifierIds: [],
    userIds: [],
    roles: [],
    platforms: [],
    minVersion: '',
    maxVersion: '',
    condition: '',
    startsAt: '',
    endsAt: '',
  };
}

/** `2026-10-15T07:30` (hora local) desde un ISO; `''` si no hay fecha válida. */
export function isoToLocalInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** ISO desde el valor de un `datetime-local` (hora local); `null` si está vacío o es inválido. */
export function localInputToIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function announcementToForm(announcement: Announcement): AnnouncementFormValue {
  const audience = announcement.audience ?? {};
  const action = announcement.action ?? null;
  return {
    app: announcement.app,
    tone: announcement.tone,
    title: announcement.title,
    body: announcement.body,
    actionType: action?.type ?? '',
    actionLabel: action?.label ?? '',
    actionUrl: action?.url ?? '',
    actionRoute: action?.route ?? '',
    dismissible: announcement.dismissible,
    notify: announcement.notify,
    repeat: announcement.repeat,
    snoozeHours: String(announcement.snoozeHours ?? 24),
    priority: String(announcement.priority ?? 50),
    accountIds: [...(audience.accountIds ?? [])],
    notifierIds: [...(audience.notifierIds ?? [])],
    userIds: [...(audience.userIds ?? [])],
    roles: [...(audience.roles ?? [])],
    platforms: [...(audience.platforms ?? [])],
    minVersion: audience.minVersion ?? '',
    maxVersion: audience.maxVersion ?? '',
    condition: audience.condition ?? '',
    startsAt: isoToLocalInput(announcement.startsAt),
    endsAt: isoToLocalInput(announcement.endsAt),
  };
}

/**
 * Cambia la app de un formulario (crear o duplicar): quita la audiencia y la acción que la
 * otra app no entiende. Devuelve el valor nuevo y, si algo se quitó, un aviso.
 */
export function switchFormApp(
  value: AnnouncementFormValue,
  app: AnnouncementApp,
): { value: AnnouncementFormValue; removed: string[] } {
  if (value.app === app) return { value, removed: [] };
  const fields = audienceFieldsFor(app);
  const removed: string[] = [];
  const next: AnnouncementFormValue = { ...value, app };

  if (!fields.notifierIds && next.notifierIds.length) {
    next.notifierIds = [];
    removed.push('los celulares elegidos');
  }
  if (!fields.condition && next.condition) {
    next.condition = '';
    removed.push('la condición automática');
  }
  if (!fields.userIds && next.userIds.length) {
    next.userIds = [];
    removed.push('los usuarios elegidos');
  }
  if (!fields.roles && next.roles.length) {
    next.roles = [];
    removed.push('los roles');
  }
  if (!fields.platforms && next.platforms.length) next.platforms = [];
  if (!fields.notify) next.notify = false;

  if (next.actionType && !isActionAllowed(app, next.actionType)) {
    next.actionType = '';
    next.actionLabel = '';
    next.actionUrl = '';
    next.actionRoute = '';
    next.dismissible = true;
    removed.push('el botón (esa acción no existe en la otra app)');
  }

  // La ficha de la tienda sugerida sigue a la app.
  if (next.actionType === 'update_app') {
    const previousDefault = DEFAULT_STORE_URLS[`${value.app}/android`];
    if (!next.actionUrl.trim() || next.actionUrl === previousDefault) {
      next.actionUrl = DEFAULT_STORE_URLS[`${app}/android`] ?? '';
    }
  }
  // Las versiones son de la otra app: no sirven.
  if (next.minVersion || next.maxVersion) {
    next.minVersion = '';
    next.maxVersion = '';
    removed.push('el filtro de versión');
  }
  return { value: next, removed };
}

function isWholeNumberIn(value: string, min: number, max: number): boolean {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const parsed = Number(trimmed);
  return parsed >= min && parsed <= max;
}

/** Validaciones del contrato, por campo, con el texto que ve el superadmin. */
export function validateAnnouncementForm(value: AnnouncementFormValue): AnnouncementFormErrors {
  const errors: AnnouncementFormErrors = {};
  const title = value.title.trim();
  const body = value.body.trim();

  if (!title) errors.title = 'Escribe el título.';
  else if (title.length > TITLE_MAX) errors.title = `Máximo ${TITLE_MAX} caracteres.`;

  if (!body) errors.body = 'Escribe el mensaje.';
  else if (body.length > BODY_MAX) errors.body = `Máximo ${BODY_MAX} caracteres.`;

  if (value.actionType) {
    if (!isActionAllowed(value.app, value.actionType)) {
      errors.actionType = `Esa acción no existe en ${APP_LABELS[value.app]}.`;
    }
    const label = value.actionLabel.trim();
    if (!label) errors.actionLabel = 'Escribe el texto del botón.';
    else if (label.length > ACTION_LABEL_MAX) {
      errors.actionLabel = `Máximo ${ACTION_LABEL_MAX} caracteres.`;
    }
    if (actionNeedsUrl(value.actionType) && !/^https:\/\/\S+$/i.test(value.actionUrl.trim())) {
      errors.actionUrl = 'Pon un enlace que empiece por https://';
    }
    if (actionNeedsRoute(value.actionType) && !value.actionRoute.trim().startsWith('/')) {
      errors.actionRoute = 'La pantalla debe empezar por /, por ejemplo /settings.';
    }
  } else if (!value.dismissible) {
    errors.dismissible = 'Para que no se pueda cerrar, el aviso necesita un botón.';
  }

  if (!isWholeNumberIn(value.snoozeHours, 1, 720)) {
    errors.snoozeHours = 'Un número entero entre 1 y 720.';
  }
  if (!isWholeNumberIn(value.priority, 0, 100)) {
    errors.priority = 'Un número entero entre 0 y 100.';
  }

  const min = value.minVersion.trim();
  const max = value.maxVersion.trim();
  if (min && !isValidVersionInput(min))
    errors.minVersion = 'Usa números con puntos, por ejemplo 1.0.10.';
  if (max && !isValidVersionInput(max))
    errors.maxVersion = 'Usa números con puntos, por ejemplo 1.0.10.';
  if (
    !errors.minVersion &&
    !errors.maxVersion &&
    min &&
    max &&
    compareAppVersions(min, max) === 1
  ) {
    errors.maxVersion = 'La versión máxima no puede ser menor que la mínima.';
  }

  if (value.startsAt && !localInputToIso(value.startsAt)) errors.startsAt = 'Fecha no válida.';
  if (value.endsAt && !localInputToIso(value.endsAt)) errors.endsAt = 'Fecha no válida.';
  const start = localInputToIso(value.startsAt);
  const end = localInputToIso(value.endsAt);
  if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
    errors.endsAt = 'El final debe ser después del inicio.';
  }

  const fields = audienceFieldsFor(value.app);
  if (!fields.notifierIds && value.notifierIds.length) {
    errors.notifierIds = 'Los celulares solo aplican al Notificador.';
  }
  if (!fields.condition && value.condition) {
    errors.condition = 'Las condiciones solo aplican al Notificador.';
  }
  if (!fields.userIds && value.userIds.length) {
    errors.userIds = 'Los usuarios solo aplican a la App de YEP.';
  }
  if (!fields.roles && value.roles.length) errors.roles = 'Los roles solo aplican a la App de YEP.';

  return errors;
}

/** Audiencia que se envía: solo los campos que aplican a la app. */
export function formToAudience(value: AnnouncementFormValue): AnnouncementAudience {
  const fields = audienceFieldsFor(value.app);
  const audience: AnnouncementAudience = { accountIds: [...value.accountIds] };
  if (fields.notifierIds) audience.notifierIds = [...value.notifierIds];
  if (fields.userIds) audience.userIds = [...value.userIds];
  if (fields.roles) audience.roles = [...value.roles];
  audience.platforms = fields.platforms ? [...value.platforms] : [];
  const min = value.minVersion.trim();
  const max = value.maxVersion.trim();
  if (min) audience.minVersion = min;
  if (max) audience.maxVersion = max;
  if (fields.condition && value.condition) audience.condition = value.condition;
  return audience;
}

export function formToAction(value: AnnouncementFormValue): AnnouncementAction | null {
  if (!value.actionType) return null;
  const action: AnnouncementAction = { type: value.actionType, label: value.actionLabel.trim() };
  if (actionNeedsUrl(value.actionType)) action.url = value.actionUrl.trim();
  if (actionNeedsRoute(value.actionType)) action.route = value.actionRoute.trim();
  return action;
}

/**
 * Cuerpo para el backend. Al crear se omiten los opcionales vacíos; al editar se mandan en
 * `null` para borrarlos (`action`, `startsAt`, `endsAt`). La audiencia va completa.
 */
export function formToPayload(
  value: AnnouncementFormValue,
  options: { mode: 'create' | 'update'; status?: AnnouncementStatus },
): AnnouncementPayload {
  const fields = audienceFieldsFor(value.app);
  const action = formToAction(value);
  const payload: AnnouncementPayload = {
    app: value.app,
    tone: value.tone,
    title: value.title.trim(),
    body: value.body.trim(),
    dismissible: action ? value.dismissible : true,
    notify: fields.notify ? value.notify : false,
    repeat: value.repeat,
    snoozeHours: Number(value.snoozeHours.trim()),
    priority: Number(value.priority.trim()),
    audience: formToAudience(value),
  };
  if (options.status) payload.status = options.status;

  const startsAt = localInputToIso(value.startsAt);
  const endsAt = localInputToIso(value.endsAt);
  if (options.mode === 'update') {
    payload.action = action;
    payload.startsAt = startsAt;
    payload.endsAt = endsAt;
  } else {
    if (action) payload.action = action;
    if (startsAt) payload.startsAt = startsAt;
    if (endsAt) payload.endsAt = endsAt;
  }
  return payload;
}

/** Opciones de acción para la app, en el orden del contrato. */
export function actionOptionsFor(app: AnnouncementApp): readonly AnnouncementActionType[] {
  return ACTIONS_BY_APP[app];
}

/** El snooze solo aplica a `until_action` y a los que se resuelven solos (con condición). */
export function snoozeApplies(
  value: Pick<AnnouncementFormValue, 'repeat' | 'condition' | 'app'>,
): boolean {
  return value.repeat === 'until_action' || (value.app === 'notifier' && !!value.condition);
}
