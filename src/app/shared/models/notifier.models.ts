import type { BankAccount } from './bank-account.models';

export type NotifierType = 'phone_app' | 'email_gmail' | 'desktop_app';
export type NotifierIdentifierType = 'phone' | 'email';

/** Opciones de tipo mostradas como radio buttons al crear un notificador. */
export type NotifierKind = 'phone' | 'email' | 'desktop';

export interface NotifierPairedDevice {
  deviceId: string;
  model?: string;
  manufacturer?: string;
  osVersion?: string;
  appVersion?: string;
  /**
   * App de SMS por defecto del teléfono (p. ej. `com.android.mms`). `null`
   * mientras el teléfono no la reporta (app vieja o sin abrir tras actualizar).
   * Ausente en respuestas de un backend anterior.
   */
  defaultSmsPackage?: string | null;
  pairedAt: string;
}

export interface NotifierDeviceHistoryEntry extends NotifierPairedDevice {
  unpairedAt?: string;
}

/**
 * Por qué el teléfono no envió un aviso que parecía bancario:
 * - `sender_not_matched`: el remitente del SMS no es uno que reconozcamos.
 * - `content_not_matched`: el texto no coincide con un ingreso que sepamos leer.
 * - `package_not_watched`: llegó por una app que no estamos escuchando.
 */
export type NotifierDiscardReason =
  | 'sender_not_matched'
  | 'content_not_matched'
  | 'package_not_watched';

/** Avisos descartados por el teléfono, acumulados por (app, motivo). Sin texto. */
export interface NotifierRecentDiscard {
  packageName: string;
  reason: NotifierDiscardReason;
  count: number;
  firstAt: string;
  lastAt: string;
}

/** Versión del texto de consentimiento del respaldo por SMS que acepta el dueño. */
export const SMS_RELAY_CONSENT_VERSION = 'v1-2026-10';

/**
 * Estado del respaldo por SMS de un notificador de celular, tal como lo ve el
 * dueño (nunca trae la llave). `status`:
 * - `active`: autorizado y disponible.
 * - `unavailable`: autorizado, pero YEP todavía no lo ofrece (no sale ningún SMS).
 * - `disabled`: sin autorizar.
 */
export interface NotifierSmsRelayStatus {
  optedIn: boolean;
  /** YEP lo tiene encendido (interruptor global, receptores listos). */
  globallyAvailable: boolean;
  /** Efectivo: autorizado, disponible y con el celular emparejado. */
  enabled: boolean;
  status: 'active' | 'unavailable' | 'disabled';
  consentAt: string | null;
  consentVersion: string | null;
}

export interface SetSmsRelayRequest {
  enabled: boolean;
  /** Obligatorio al activar. */
  consentVersion?: string;
}

/**
 * Config operativa efectiva que el backend calcula para un notificador
 * (default global + override propio, ya saneada). Solo lectura en la UI.
 */
export interface NotifierRuntimeConfig {
  heartbeatIntervalSeconds: number;
  flushIntervalSeconds: number;
  workManagerFallbackMinutes: number;
  onlineWindowSeconds: number;
  featureFlags: Record<string, boolean>;
  configVersion: string;
}

/**
 * Override parcial de cadencias para un notificador. Los campos ausentes/null
 * heredan el default global de flota.
 */
export interface NotifierRuntimeConfigOverride {
  heartbeatIntervalSeconds?: number;
  flushIntervalSeconds?: number;
  workManagerFallbackMinutes?: number;
}

export interface Notifier {
  id: string;
  accountId: string;
  type: NotifierType;
  displayName?: string;
  identifier?: string;
  identifierType?: NotifierIdentifierType;
  bankIds: string[];
  bankAccountIds: string[];
  allowedBreBKeys: string[];
  bankAccounts: BankAccount[];
  watchedPackages: string[];
  locationId?: string;
  active: boolean;
  pairingVersion: number;
  pairedDevice: NotifierPairedDevice | null;
  deviceHistory: NotifierDeviceHistoryEntry[];
  /**
   * Avisos que el teléfono descartó en los últimos 30 días (máx. 20, del más
   * reciente al más viejo). Se borran al desemparejar.
   */
  recentDiscards?: NotifierRecentDiscard[];
  /**
   * Solo `phone_app`: respaldo por SMS cuando el celular no tiene internet.
   * `null` en otros tipos; ausente en respuestas de un backend anterior.
   */
  smsRelay?: NotifierSmsRelayStatus | null;
  lastSeenAt?: string;
  lastLoginAt?: string;
  isOnline: boolean;
  /** Config operativa efectiva (default global + override) de este notificador. */
  runtimeConfig?: NotifierRuntimeConfig;
  /** Override propio de cadencias; null cuando hereda los valores de flota. */
  runtimeConfigOverride?: NotifierRuntimeConfigOverride | null;
  accessCode?: string;
  /** Solo `email_gmail`: etiqueta única del alias de correo entrante. */
  inboundTag?: string;
  /** Solo `email_gmail`: alias completo (`buzón+tag@gmail.com`) al que reenviar. */
  inboundAlias?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotifiersResponse {
  notifiers: Notifier[];
}

export interface NotifierResponse {
  notifier: Notifier;
}

export interface DeleteNotifierResponse {
  deleted: boolean;
  id: string;
}

export interface CreateNotifierRequest {
  type?: NotifierType;
  displayName?: string;
  identifier?: string;
  identifierType?: NotifierIdentifierType;
  bankIds?: string[];
  bankAccountIds?: string[];
  allowedBreBKeys?: string[];
  watchedPackages?: string[];
  locationId?: string;
}

export interface UpdateNotifierRequest extends CreateNotifierRequest {
  active?: boolean;
  /**
   * Override de cadencias para este notificador. Objeto con los campos a
   * personalizar, o `null` para restablecer a los valores globales de flota.
   */
  runtimeConfigOverride?: NotifierRuntimeConfigOverride | null;
}
