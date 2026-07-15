/** Catálogo de bancos expuesto por el backend para el selector de cuentas. */
export interface BankPickerEntry {
  code: string;
  name: string;
  phone: { enabled: boolean };
  email: { enabled: boolean };
  /** Tipos de cuenta que ofrece el banco ([] = sin restricción). */
  supportedAccountTypes: SupportedAccountType[];
  /**
   * Tope de cuentas de este banco por notificador, por canal (`undefined` = sin
   * límite). `1` implica exclusividad: la cuenta no puede estar en otro
   * notificador del mismo canal.
   */
  accountLimits: {
    mobile?: number;
    email?: number;
    desk?: number;
  };
}

export interface BanksResponse {
  banks: BankPickerEntry[];
}

/** Canal de un notificador. */
export type ChannelKey = 'mobile' | 'email' | 'desk';

/** Estrategia de resolución de cuenta (capa 4). Espejo del backend. */
export type AccountResolutionStrategy =
  | 'single_account_per_notifier'
  | 'single_account_for_bank'
  | 'receiver_account_exact'
  | 'receiver_account_suffix'
  | 'single_or_suffix'
  | 'required_dynamic_account_match';

/** Tipo de cuenta soportado por un banco. Espejo del enum `BankAccountType`. */
export type SupportedAccountType = 'savings' | 'checking' | 'wallet' | 'other';

/** Capa 4: política de resolución de `reportedBankAccountId`. */
export interface AccountResolutionPolicy {
  strategy: AccountResolutionStrategy;
  minSuffixDigits?: number;
  requireResolvedAccount?: boolean;
  maxAccountsPerNotifier?: number;
}

/**
 * Config técnica de un canal de un banco. `packageNames` = apps a escuchar;
 * `contentPatterns` = si hay, solo pasan mensajes que contengan alguno (allowlist);
 * `displayNames` = señal para escritorio (Vínculo Windows); `senderPatterns` =
 * remitente (móvil/desk: título del SMS; email: remitentes esperados);
 * `parseRules` = reglas de extracción (regex); `accountResolutionPolicy` = cómo
 * resolver la cuenta (capa 4).
 */
export interface BankChannelConfig {
  enabled: boolean;
  packageNames: string[];
  contentPatterns: string[];
  displayNames: string[];
  senderPatterns: string[];
  parseRules?: Record<string, unknown> | null;
  accountResolutionPolicy?: AccountResolutionPolicy | null;
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
  /** Llave Bre-B del receptor extraída del texto (ej. `@LEONARDOF6907`). */
  llave?: string;
  confidence: ParseConfidence;
}

/** Mensaje de ejemplo para el probador / biblioteca. */
export interface SampleMessage {
  title?: string;
  text?: string;
  bigText?: string;
  subject?: string;
  bodyText?: string;
  /** Cuerpo HTML crudo (fallback cuando no hay texto plano, p. ej. .msg/.eml solo-HTML). */
  bodyHtml?: string;
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

/**
 * Valores esperados de la extracción (ground truth) de un ejemplo. Se comparan
 * campo a campo contra lo que extrae el parser: un ejemplo pasa (✅) solo si cada
 * campo lleno aquí coincide con lo extraído. Campos vacíos no se verifican.
 */
export interface ExpectedValues {
  amount?: number;
  currency?: string;
  senderName?: string;
  direction?: string;
  kind?: string;
  reference?: string;
  senderAccount?: string;
  receiverAccount?: string;
  /** Llave Bre-B del receptor (ej. `@LEONARDOF6907`). */
  llave?: string;
}

/** Resultado de resolución esperado de un ejemplo (flujo completo). */
export type ExpectedResolution = 'account' | 'ambiguous' | 'unresolved';

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
  /** Cuentas del notificador simuladas para verificar la resolución de cuenta. */
  simulatedAccounts?: string[] | null;
  expectedResolution?: ExpectedResolution | null;
  expectedResolvedAccount?: string | null;
  createdAt?: string;
}

/** Resultado de correr la resolución de cuenta de un ejemplo. */
export interface ExampleResolutionResult {
  outcome: ExpectedResolution;
  resolvedAccount?: string;
  reason?: string;
  expected?: ExpectedResolution;
  expectedAccount?: string;
  /** `undefined` = el ejemplo no declara resolución esperada (solo informativo). */
  ok?: boolean;
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

export interface SuggestRulesJobStartResponse {
  jobId: string;
}

export interface SuggestRulesJobResponse {
  status: 'pending' | 'done' | 'error';
  result: SuggestRulesResponse | null;
  error: string | null;
}

/** Resultado de correr un ejemplo contra la config actual (o una propuesta). */
export interface ExampleRunResult {
  example: { id: string; channel: ChannelKey; label?: string; snippet: string };
  expected?: ExpectedValues | null;
  expectMatch?: boolean;
  attributed: boolean;
  parsed: ParsedBankNotification;
  ok: boolean;
  resolution?: ExampleResolutionResult;
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
  /** Tipos de cuenta que ofrece el banco ([] = sin restricción). */
  supportedAccountTypes: SupportedAccountType[];
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
  supportedAccountTypes?: SupportedAccountType[];
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
  simulatedAccounts?: string[];
  expectedResolution?: ExpectedResolution;
  expectedResolvedAccount?: string;
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
  simulatedAccounts?: string[];
  expectedResolution?: ExpectedResolution;
  expectedResolvedAccount?: string;
}
