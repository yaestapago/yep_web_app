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

/** Isolate de la app móvil que mandó el último heartbeat. */
export type NotifierCaptureSource = 'foreground' | 'ui' | 'workmanager';

/**
 * Contadores del receptor nativo (`yep_capture`) desde que arrancó el proceso
 * de la app. Todo opcional: lo manda la app ≥ 1.0.8 y el backend lo pasa tal
 * cual, saneado.
 */
export interface NotifierCaptureReceiverStats {
  received?: number | null;
  accepted?: number | null;
  nearMiss?: number | null;
  ignored?: number | null;
  noRules?: number | null;
  lastReceivedAt?: string | null;
  lastStoredAt?: string | null;
  inboxPending?: number | null;
  rulesLoaded?: boolean | null;
}

/**
 * Una app y cuántas notificaciones vio el listener desde el arranque. El
 * backend manda el arreglo ordenado de mayor a menor (máx. 50; `[]` si nada).
 */
export interface NotifierSeenByPackageEntry {
  packageName: string;
  count: number;
}

/**
 * Por qué falló la prueba de escucha:
 * - `not_posted`: la app no pudo mostrar su notificación de prueba (sin permiso
 *   de notificaciones), así que no hay nada que el listener pudiera ver.
 * - `listener_missed`: la notificación salió, pero el listener no la recibió.
 */
export type NotifierSelfTestFailureReason = 'listener_missed' | 'not_posted';

/** Resultado de la prueba de escucha que el celular se hace a sí mismo. */
export interface NotifierCaptureSelfTest {
  at?: string | null;
  ok?: boolean | null;
  latencyMs?: number | null;
  /** Solo cuando `ok === false`; ausente en una app/backend anterior. */
  reason?: NotifierSelfTestFailureReason | null;
  /**
   * Parte "conversación" de la prueba (app ≥ 1.0.9): llegó la notificación de
   * tipo conversación (como un SMS). `false` = «Conversaciones» está apagado
   * para YEP; `null`/ausente = no se probó (o Android < 12).
   */
  conversationOk?: boolean | null;
}

/**
 * Foto de la captura en el celular tal como llegó en el último heartbeat
 * (app ≥ 1.0.8). `listenerConnected` es la verdad sobre si Android tiene
 * enlazado el servicio que lee notificaciones: el servicio en primer plano puede
 * estar vivo y el celular, aun así, sordo. Todos los campos son opcionales
 * porque dependen de la versión de la app y del backend.
 */
export interface NotifierCaptureSnapshot {
  /** Momento del heartbeat que trajo esta foto. */
  at?: string | null;
  source?: NotifierCaptureSource | null;
  /** Lo que la app concluyó: servicio vivo Y listener enlazado Y permiso. */
  captureActive?: boolean | null;
  listenerConnected?: boolean | null;
  listenerConnectedAt?: string | null;
  listenerDisconnectedAt?: string | null;
  permissionGranted?: boolean | null;
  /**
   * Si la app puede mostrar sus propias notificaciones. Sin ese permiso no
   * puede hacer la prueba de escucha ni avisarle al usuario que algo falla.
   */
  notificationsEnabled?: boolean | null;
  /**
   * Si Android le entrega a YEP las notificaciones de tipo conversación (ahí
   * caen los SMS de Google Messages; app ≥ 1.0.9). `false` = el usuario apagó
   * «Conversaciones» para YEP: el listener corre pero no ve los SMS.
   * `null`/ausente = no se ha probado o el Android no tiene ese filtro (< 12).
   */
  conversationsAllowed?: boolean | null;
  componentEnabled?: boolean | null;
  serviceRunning?: boolean | null;
  /** `null` cuando la app no pudo leerlo. */
  batteryUnrestricted?: boolean | null;
  processStartedAt?: string | null;
  /** Notificaciones de cualquier app vistas por el listener desde `processStartedAt`. */
  seenTotal?: number | null;
  /**
   * Apps vistas y cuántas veces, de mayor a menor (máx. 50). El backend lo
   * expone como arreglo (Mongo no admite puntos en claves de mapa); se tolera
   * también el objeto `{ paquete: n }` de un backend anterior.
   */
  seenByPackage?: NotifierSeenByPackageEntry[] | Record<string, number> | null;
  /** Paquete Android de la última notificación que vio el listener (cualquier app). */
  lastNotificationPackage?: string | null;
  receiver?: NotifierCaptureReceiverStats | null;
  rebindAttempts?: number | null;
  lastRebindAt?: string | null;
  selfTest?: NotifierCaptureSelfTest | null;
}

/** Un punto de la línea de tiempo de captura (uno por heartbeat, ~24 h). */
export interface NotifierCaptureHistoryEntry {
  at: string;
  source?: NotifierCaptureSource | null;
  captureActive: boolean;
  listenerConnected?: boolean | null;
  seenTotal?: number | null;
  lastNotificationAt?: string | null;
  inboxPending?: number | null;
}

/** Resumen del último reporte de diagnóstico que mandó la app (en el notifier serializado). */
export interface NotifierLatestDiagnosticReport {
  at: string;
  appVersion?: string | null;
  summary?: {
    listenerConnected?: boolean | null;
    selfTestOk?: boolean | null;
    seenTotal?: number | null;
  } | null;
}

/** Cuerpo del reporte que la app manda a `POST /notifier-app/diagnostics`. Todo opcional. */
export interface NotifierDiagnosticReportBody {
  appVersion?: string | null;
  device?: { model?: string | null; manufacturer?: string | null; osVersion?: string | null } | null;
  health?: NotifierCaptureSnapshot | null;
  rules?: { rulesVersion?: string | null; watched?: string[] | null; pairings?: number | null } | null;
  nearMisses?: Array<{
    at: string;
    packageName: string;
    reason: NotifierDiscardReason | string;
    title?: string | null;
  }> | null;
  heartbeats?: Array<{
    at: string;
    source?: NotifierCaptureSource | null;
    captureActive: boolean;
    ok: boolean;
  }> | null;
  notes?: string | null;
}

/** Reporte completo guardado por el backend (máx. 5, el más reciente primero). */
export interface NotifierDiagnosticReport {
  at: string;
  appVersion?: string | null;
  report?: NotifierDiagnosticReportBody | null;
}

/** Respuesta de `GET /notifiers/:id/diagnostics`. */
export interface NotifierDiagnosticsResponse {
  capture?: NotifierCaptureSnapshot | null;
  /** Todas las entradas guardadas (hasta ~288 ≈ 24 h a 5 min). */
  captureHistory?: NotifierCaptureHistoryEntry[] | null;
  reports?: NotifierDiagnosticReport[] | null;
}

/**
 * Regla de escucha del celular, si el backend la expone en el notifier. Solo se
 * usa para marcar apps vigiladas en el diagnóstico; `watchedPackages` manda.
 */
export interface NotifierWatchRule {
  packageNames?: string[] | null;
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
  /**
   * Último heartbeat en que el servicio que captura estaba vivo (app ≥ 1.0.6).
   * `null`/ausente: la app aún no lo reporta y "en línea" es lo único que hay.
   * Un celular que solo late por WorkManager tiene `lastSeenAt` fresco pero
   * esta marca vieja: está en línea, pero sordo.
   */
  lastCaptureAliveAt?: string | null;
  /** Isolate del último heartbeat (diagnóstico). */
  captureSource?: NotifierCaptureSource | null;
  /** Calculado por el backend al serializar; la UI lo recalcula con el reloj. */
  isListening?: boolean;
  /**
   * Última notificación de CUALQUIER app que vio el listener del celular
   * (app ≥ 1.0.8). Si está vieja mientras el celular late, el listener está sordo.
   */
  lastNotificationAt?: string | null;
  /** Foto de la captura del último heartbeat (app ≥ 1.0.8). */
  capture?: NotifierCaptureSnapshot | null;
  /** Últimas entradas (≈ 60) de la línea de tiempo de captura. */
  captureHistory?: NotifierCaptureHistoryEntry[] | null;
  latestDiagnosticReport?: NotifierLatestDiagnosticReport | null;
  /** Reglas de escucha, solo si el backend las expone al dueño. */
  watchRules?: NotifierWatchRule[] | null;
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
