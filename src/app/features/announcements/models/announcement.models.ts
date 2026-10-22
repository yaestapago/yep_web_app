/**
 * Anuncios y avisos para las apps (contrato: `docs/anuncios-y-avisos.md` en local-dev-env).
 * Lo que aquí se llama "anuncio" es el modal con un botón que el backend le entrega al
 * Notificador (latido) y a la App de YEP (`GET /announcements/mine`).
 */

export type AnnouncementApp = 'notifier' | 'yep';
export type AnnouncementStatus = 'draft' | 'published' | 'archived';
export type AnnouncementTone = 'info' | 'success' | 'warning' | 'danger';
export type AnnouncementRepeat = 'once' | 'until_action';
export type AnnouncementSource = 'manual' | 'system';
export type AnnouncementRole = 'account_owner' | 'account_staff';
export type AnnouncementPlatform = 'android' | 'ios';

/** Condiciones de los anuncios automáticos (solo Notificador). */
export type AnnouncementCondition =
  | 'permission_missing'
  | 'listener_off'
  | 'conversations_blocked'
  | 'sms_hidden'
  | 'notifications_blocked'
  | 'battery_restricted';

export type AnnouncementActionType =
  | 'update_app'
  | 'open_url'
  | 'open_route'
  | 'open_notification_access'
  | 'open_conversations_settings'
  | 'save_bank_contact'
  | 'open_autostart_settings'
  | 'open_battery_settings'
  | 'open_app_notification_settings'
  | 'run_self_test'
  | 'open_diagnostics';

export interface AnnouncementAction {
  type: AnnouncementActionType;
  /** 1–30 caracteres. */
  label: string;
  /** `update_app` y `open_url` (https). */
  url?: string | null;
  /** `open_route` (empieza por `/`). */
  route?: string | null;
}

export interface AnnouncementAudience {
  /** Negocios. Vacío = todos. */
  accountIds?: string[];
  /** Solo `app=notifier`. Vacío = todos. */
  notifierIds?: string[];
  /** Solo `app=yep`. Vacío = todos. */
  userIds?: string[];
  /** Solo `app=yep`. Vacío = todos. */
  roles?: AnnouncementRole[];
  /** Vacío = todas. El Notificador es siempre Android. */
  platforms?: AnnouncementPlatform[];
  /** Semver inclusivo. */
  minVersion?: string | null;
  maxVersion?: string | null;
  /** Solo `app=notifier`. */
  condition?: AnnouncementCondition | null;
}

/** Conteo de recibos con cada fecha (`seenAt`, `actionAt`, `dismissedAt`, `notifiedAt`). */
export interface AnnouncementStats {
  seen: number;
  action: number;
  dismissed: number;
  notified: number;
}

export interface Announcement {
  id: string;
  app: AnnouncementApp;
  status: AnnouncementStatus;
  /** `auto` = tiene `audience.condition` (lo calcula el backend). */
  kind?: 'manual' | 'auto';
  tone: AnnouncementTone;
  title: string;
  body: string;
  action?: AnnouncementAction | null;
  dismissible: boolean;
  notify: boolean;
  repeat: AnnouncementRepeat;
  snoozeHours: number;
  priority: number;
  audience: AnnouncementAudience;
  startsAt?: string | null;
  endsAt?: string | null;
  source: AnnouncementSource;
  systemKey?: string | null;
  createdBy?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  stats?: AnnouncementStats | null;
}

/** Cuerpo de `POST /admin/announcements` y `PATCH /admin/announcements/:id`. */
export interface AnnouncementPayload {
  app: AnnouncementApp;
  status?: AnnouncementStatus;
  tone: AnnouncementTone;
  title: string;
  body: string;
  action?: AnnouncementAction | null;
  dismissible: boolean;
  notify: boolean;
  repeat: AnnouncementRepeat;
  snoozeHours: number;
  priority: number;
  audience: AnnouncementAudience;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface AnnouncementListQuery {
  status?: AnnouncementStatus | null;
  app?: AnnouncementApp | null;
}

export type AnnouncementRecipientType = 'notifier' | 'user';

/** Recibo de un destinatario (`GET /admin/announcements/:id/receipts`), ya normalizado. */
export interface AnnouncementReceipt {
  id: string;
  announcementKey: string;
  recipientType: AnnouncementRecipientType;
  recipientId: string;
  /** Notificador: `displayName`; usuario: email. */
  recipientName: string | null;
  /** Notificador: `deviceModel` (`pairedDevice.model`). */
  recipientDetail: string | null;
  /** Usuario: email. */
  email: string | null;
  accountId: string | null;
  accountName: string | null;
  appVersion: string | null;
  platform: AnnouncementPlatform | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  seenCount: number;
  notifiedAt: string | null;
  actionAt: string | null;
  dismissedAt: string | null;
  dismissCount: number;
}

export interface AnnouncementReceiptsPage {
  receipts: AnnouncementReceipt[];
  /** `null` si el backend no informa el total. */
  total: number | null;
}

export interface AudiencePreviewResponse {
  notifiers?: number;
  users?: number;
}

/**
 * `DELETE /admin/announcements/:id`: un borrador manual se borra (`deleted: true`); lo
 * demás se archiva (`deleted: false`), incluidos los automáticos, que se recrearían.
 */
export interface AnnouncementDeleteResult {
  deleted: boolean;
  announcement: Announcement | null;
}

/** Política de versión por `(app, platform)` (colección `app_releases`). */
export interface AppRelease {
  id?: string | null;
  /** `update:<app>:<platform>:<latestVersion>`: key del aviso de actualizar vigente. */
  key?: string | null;
  /** Recibos del aviso de actualizar vigente. */
  stats?: AnnouncementStats | null;
  app: AnnouncementApp;
  platform: AnnouncementPlatform;
  latestVersion: string;
  minSupportedVersion?: string | null;
  storeUrl: string;
  title?: string | null;
  body?: string | null;
  notify: boolean;
  enabled: boolean;
  updatedAt?: string | null;
}

/** Cuerpo de `PUT /admin/app-releases/:app/:platform`. */
export interface AppReleasePayload {
  latestVersion: string;
  minSupportedVersion: string | null;
  storeUrl: string;
  title: string | null;
  body: string | null;
  notify: boolean;
  enabled: boolean;
}

export interface NotifierVersionCount {
  /** `pairedDevice.appVersion`; `null` si el celular no la informó. */
  version: string | null;
  count: number;
}

export interface AppReleasesResponse {
  releases: AppRelease[];
  notifierVersions: NotifierVersionCount[];
}

export interface AppReleaseSlot {
  app: AnnouncementApp;
  platform: AnnouncementPlatform;
}

/** Las tres políticas que el panel administra, en orden. */
export const APP_RELEASE_SLOTS: readonly AppReleaseSlot[] = [
  { app: 'notifier', platform: 'android' },
  { app: 'yep', platform: 'android' },
  { app: 'yep', platform: 'ios' },
];

/** URLs de tienda que el panel sugiere cuando no hay política (iOS no tiene). */
export const DEFAULT_STORE_URLS: Readonly<Record<string, string>> = {
  'notifier/android': 'https://play.google.com/store/apps/details?id=co.yaestapago.notifier',
  'yep/android': 'https://play.google.com/store/apps/details?id=co.yaestapago.app',
};

export function releaseSlotKey(slot: AppReleaseSlot): string {
  return `${slot.app}/${slot.platform}`;
}

/** Primera versión de cada app que muestra los anuncios. */
export const ANNOUNCEMENTS_MIN_APP_VERSION: Readonly<Record<AnnouncementApp, string>> = {
  notifier: '1.0.10',
  yep: '1.2.0',
};
