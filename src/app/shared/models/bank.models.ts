/** Catálogo de bancos expuesto por el backend para el selector de cuentas. */
export interface BankPickerEntry {
  code: string;
  name: string;
  phone: { enabled: boolean };
  email: { enabled: boolean };
}

export interface BanksResponse {
  banks: BankPickerEntry[];
}

/** Canal de un notificador. */
export type ChannelKey = 'mobile' | 'email' | 'desk';

/**
 * Config técnica de un canal de un banco. `packageNames` = apps a escuchar;
 * `contentPatterns` = si hay, solo pasan mensajes que contengan alguno (allowlist);
 * `displayNames` = señal para escritorio (Vínculo Windows); `senderPatterns` =
 * remitente (móvil/desk: título del SMS; email: remitentes esperados);
 * `parseRules` = reglas de extracción (regex).
 */
export interface BankChannelConfig {
  enabled: boolean;
  packageNames: string[];
  contentPatterns: string[];
  displayNames: string[];
  senderPatterns: string[];
  parseRules?: Record<string, unknown> | null;
}

export type ParseConfidence = 'high' | 'medium' | 'low' | 'none';
export type TransactionDirection = 'incoming' | 'outgoing';

/** Resultado de parseo (espejo de ParsedBankNotification del backend). */
export interface ParsedBankNotification {
  bankId?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  transactionDate?: string;
  senderAccount?: string;
  senderName?: string;
  receiverAccount?: string;
  direction?: TransactionDirection;
  kind?: string;
  confidence: ParseConfidence;
}

/** Mensaje de ejemplo para el probador / biblioteca. */
export interface SampleMessage {
  title?: string;
  text?: string;
  bigText?: string;
  subject?: string;
  bodyText?: string;
  from?: string;
  date?: string;
  postTime?: number;
}

export interface ParseTestRequest {
  channel: ChannelKey;
  sample: SampleMessage;
  config: Partial<BankChannelConfig>;
}

export interface ParseTestResponse {
  attributed: boolean;
  parsed: ParsedBankNotification;
}

/** Valores esperados de la extracción (ground truth) de un ejemplo. */
export interface ExpectedValues {
  amount?: number;
  senderName?: string;
  direction?: string;
  kind?: string;
  reference?: string;
  senderAccount?: string;
  receiverAccount?: string;
}

/** Ejemplo curado (fixture) persistido en un banco. */
export interface BankExample {
  id: string;
  channel: ChannelKey;
  label?: string;
  title?: string;
  text?: string;
  bigText?: string;
  subject?: string;
  bodyText?: string;
  from?: string;
  expected?: ExpectedValues | null;
  /** `false` = ejemplo negativo (NO debería parsearse). Por defecto `true`. */
  expectMatch?: boolean;
  createdAt?: string;
}

/**
 * Diagnóstico de por qué un ejemplo falló, con un arreglo opcional de 1 clic
 * (agregar un patrón faltante al canal). Nunca se aplica solo.
 */
export interface ExampleDiagnosis {
  reason:
    | 'sender_not_matched'
    | 'content_not_matched'
    | 'no_rules'
    | 'extraction_failed'
    | 'false_positive';
  message: string;
  fix?: {
    field: 'senderPatterns' | 'contentPatterns' | 'packageNames';
    channel: ChannelKey;
    value: string;
  };
}

/** Plantilla del prompt del copiloto (editable en caliente). */
export interface CopilotPromptResponse {
  prompt: string;
  isDefault: boolean;
  default: string;
}

/** Respuesta del copiloto al proponer reglas para un canal. */
export interface SuggestRulesResponse {
  proposedRules: Record<string, unknown>;
  results: ExampleRunResult[];
  allPass: boolean;
  iterations: number;
  costUsd: number;
}

/** Resultado de correr un ejemplo contra la config actual (o una propuesta). */
export interface ExampleRunResult {
  example: { id: string; channel: ChannelKey; label?: string; snippet: string };
  expected?: ExpectedValues | null;
  expectMatch?: boolean;
  attributed: boolean;
  parsed: ParsedBankNotification;
  ok: boolean;
  diagnosis?: ExampleDiagnosis;
}

/** Evento real reciente (para capturar como ejemplo). */
export interface RecentEvent {
  id: string;
  occurredAt?: string;
  snippet: string;
  sample: SampleMessage;
}

/** Banco del catálogo global con su config completa (vista de superadmin). */
export interface AdminBank {
  code: string;
  name: string;
  isActive: boolean;
  mobile: BankChannelConfig;
  email: BankChannelConfig;
  desk: BankChannelConfig;
  examples: BankExample[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminBanksResponse {
  banks: AdminBank[];
}

export interface AdminBankResponse {
  bank: AdminBank;
}

export interface CreateBankRequest {
  code: string;
  name: string;
  isActive?: boolean;
  mobile?: Partial<BankChannelConfig>;
  email?: Partial<BankChannelConfig>;
  desk?: Partial<BankChannelConfig>;
}

/** El `code` es inmutable, por eso se omite del patch de actualización. */
export type UpdateBankRequest = Partial<Omit<CreateBankRequest, 'code'>>;

/** Payload para agregar un ejemplo a un banco. */
export interface AddExampleRequest {
  channel: ChannelKey;
  label?: string;
  title?: string;
  text?: string;
  bigText?: string;
  subject?: string;
  bodyText?: string;
  from?: string;
  expected?: ExpectedValues;
  expectMatch?: boolean;
}

/** Payload para pedir a la IA los valores esperados de un mensaje. */
export interface SuggestExpectedRequest {
  channel: ChannelKey;
  sample: SampleMessage;
}

/** Patch para modificar un ejemplo guardado (el canal es inmutable). */
export interface UpdateExampleRequest {
  label?: string;
  title?: string;
  text?: string;
  bigText?: string;
  subject?: string;
  bodyText?: string;
  from?: string;
  expected?: ExpectedValues | null;
  expectMatch?: boolean;
}
