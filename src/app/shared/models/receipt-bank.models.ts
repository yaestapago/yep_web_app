/**
 * Banco de comprobantes (superadmin). Se organiza por banco emisor: el banco
 * desde el que se hizo la transferencia. Espejo de la etiqueta `Receipt Bank`
 * de `openapi.yaml` y de `receipt-bank.views.ts` en el backend.
 */

export type ReceiptFieldKey =
  | 'amount'
  | 'currency'
  | 'dateTime'
  | 'reference'
  | 'senderName'
  | 'senderAccount'
  | 'receiverName'
  | 'receiverAccount'
  | 'llave'
  | 'status'
  | 'kind';

export type ReceiptValueFormat =
  | 'money'
  | 'datetime'
  | 'date'
  | 'account'
  | 'phone'
  | 'name'
  | 'reference'
  | 'text';

export type ReceiptTemplateKind =
  | 'same_bank_transfer'
  | 'other_bank_transfer'
  | 'bre_b'
  | 'qr_payment'
  | 'pse'
  | 'deposit'
  | 'other';

export type ReceiptMedium = 'app_screenshot' | 'pdf' | 'other';
export type ReceiptTemplateStatus = 'draft' | 'approved' | 'disabled';
export type ReceiptExampleStatus = 'draft' | 'confirmed';
export type ReceiptSourceType = 'client_support' | 'superadmin_upload';

export type ReceiptFallbackReason =
  | 'mode_off'
  | 're2_unavailable'
  | 'no_templates'
  | 'no_match'
  | 'ambiguous_match'
  | 'rule_error'
  | 'incomplete'
  | 'invalid_value';

export type ReceiptApprovalBlocker =
  | 'invalid_rules'
  | 'weak_detection'
  | 'no_required_fields'
  | 'too_few_examples'
  | 'examples_failing'
  | 'collisions'
  | 're2_unavailable';

// --- Emisores ---------------------------------------------------------------

export interface ReceiptIssuer {
  id: string;
  code: string;
  name: string;
  bankCode: string | null;
  aliases: string[];
  isActive: boolean;
  notes: string | null;
  templateCounts: Record<ReceiptTemplateStatus, number>;
  exampleCounts: Record<ReceiptExampleStatus, number>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateReceiptIssuerRequest {
  code: string;
  name: string;
  bankCode?: string;
  aliases?: string[];
  notes?: string;
}

export interface UpdateReceiptIssuerRequest {
  name?: string;
  bankCode?: string | null;
  aliases?: string[];
  isActive?: boolean;
  notes?: string | null;
}

// --- Plantillas -------------------------------------------------------------

export interface ReceiptTemplateField {
  key: ReceiptFieldKey;
  required?: boolean;
  labels?: string[];
  valueFormat: ReceiptValueFormat;
  notes?: string;
}

export interface ReceiptDetection {
  allOf?: string[];
  anyOf?: string[];
  noneOf?: string[];
  minAnyOf?: number;
}

export interface ReceiptDefinition {
  fields?: ReceiptTemplateField[];
  detection?: ReceiptDetection;
  /** Reglas de extracción (RE2). Las valida el backend. */
  rules?: Record<string, unknown>;
}

export interface ReceiptTemplateSummary {
  id: string;
  issuerId: string;
  issuerCode: string;
  code: string;
  name: string;
  kind: ReceiptTemplateKind;
  medium: ReceiptMedium;
  status: ReceiptTemplateStatus;
  approvedVersion: number | null;
  hasUnapprovedChanges: boolean;
  exampleCounts: Record<ReceiptExampleStatus, number>;
  updatedAt: string | null;
}

export interface ReceiptTemplateApproved {
  version: number;
  definition: ReceiptDefinition;
  approvedAt: string | null;
  approvedByUserId: string;
  approvedByName: string | null;
  passed: number;
  total: number;
}

export interface ReceiptTemplate {
  id: string;
  issuerId: string;
  issuerCode: string;
  code: string;
  name: string;
  kind: ReceiptTemplateKind;
  medium: ReceiptMedium;
  status: ReceiptTemplateStatus;
  draft: ReceiptDefinition;
  approved: ReceiptTemplateApproved | null;
  hasUnapprovedChanges: boolean;
  history: { version: number; approvedAt: string | null; approvedByUserId: string }[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateReceiptTemplateRequest {
  code: string;
  name: string;
  kind: ReceiptTemplateKind;
  medium?: ReceiptMedium;
  draft?: ReceiptDefinition;
}

export interface UpdateReceiptTemplateRequest {
  name?: string;
  kind?: ReceiptTemplateKind;
  medium?: ReceiptMedium;
  draft?: ReceiptDefinition;
}

// --- Probar y aprobar -------------------------------------------------------

export type ReceiptFieldTestStatus = 'ok' | 'mismatch' | 'missing' | 'unexpected' | 'not_checked';

export interface ReceiptTestField {
  key: ReceiptFieldKey;
  status: ReceiptFieldTestStatus;
  ok: boolean;
  /** Valor real del comprobante. En el 409 de aprobar siempre llega `null`. */
  expected: unknown;
  got: unknown;
}

export interface ReceiptTestExampleResult {
  exampleId: string;
  label: string | null;
  expectMatch: boolean;
  ok: boolean;
  detection?: {
    matched: boolean;
    missingAllOf: string[];
    hitNoneOf: string[];
    anyOfHits: number;
    otherTemplateId: string | null;
  };
  fields?: ReceiptTestField[];
  diagnosis?: { reason: string; message: string } | null;
}

export interface ReceiptTestCollision {
  exampleId: string;
  templateId: string | null;
  templateName: string | null;
  templateStatus: ReceiptTemplateStatus | null;
  direction: 'this_detects_other' | 'other_detects_this';
  blocking: boolean;
}

export interface ReceiptTestResult {
  allPass: boolean;
  canApprove: boolean;
  blockers: ReceiptApprovalBlocker[];
  positives: { passed: number; total: number };
  negatives: { passed: number; total: number };
  collisions: ReceiptTestCollision[];
  results: ReceiptTestExampleResult[];
}

/** Cuerpo del 409 de `POST /templates/:id/approve`. */
export interface ReceiptApprovalConflict {
  statusCode: number;
  message: string;
  blockers?: ReceiptApprovalBlocker[];
  result?: ReceiptTestResult;
}

// --- Candidatos -------------------------------------------------------------

export interface ReceiptCandidate {
  paymentSupportId: string;
  accountId: string;
  accountName: string | null;
  createdAt: string;
  mimeType: string | null;
  sizeBytes: number | null;
  issuerHint: string | null;
  method: 'rules' | 'ai' | null;
  fallbackReason: string | null;
  alreadySelected: boolean;
}

export interface ReceiptCandidatesQuery {
  from?: string;
  to?: string;
  accountId?: string;
  issuerHint?: string;
  fallbackReason?: ReceiptFallbackReason;
  onlyUnselected?: boolean;
  cursor?: string;
  limit?: number;
}

export interface ReceiptCandidatesPage {
  candidates: ReceiptCandidate[];
  nextCursor: string | null;
}

// --- Ejemplos ---------------------------------------------------------------

export interface ReceiptExampleSummary {
  id: string;
  label: string | null;
  status: ReceiptExampleStatus;
  expectMatch: boolean;
  issuerId: string | null;
  templateId: string | null;
  sourceType: ReceiptSourceType;
  mimeType: string;
  selectedAt: string | null;
  confirmedAt: string | null;
}

export type ReceiptExpectedValues = Partial<Record<ReceiptFieldKey, number | string>>;

export interface ReceiptExamplePerson {
  userId: string;
  name: string | null;
}

export interface ReceiptExample extends ReceiptExampleSummary {
  ocr: { text: string; mode: string; extractedAt: string | null };
  expected: ReceiptExpectedValues | null;
  absentFields: ReceiptFieldKey[];
  aiSuggestion: { expected: ReceiptExpectedValues; suggestedAt: string | null } | null;
  source: {
    type: ReceiptSourceType;
    paymentSupportId: string | null;
    accountId: string | null;
  };
  selectedBy: ReceiptExamplePerson;
  confirmedBy: ReceiptExamplePerson | null;
  events: { type: string; byUserId: string; at: string | null }[];
}

export interface ReceiptExamplesQuery {
  issuerId?: string;
  templateId?: string;
  status?: ReceiptExampleStatus;
  sourceType?: ReceiptSourceType;
  cursor?: string;
  limit?: number;
}

export interface ReceiptExamplesPage {
  examples: ReceiptExampleSummary[];
  nextCursor: string | null;
}

export interface UpdateReceiptExampleRequest {
  issuerId?: string | null;
  templateId?: string | null;
  label?: string | null;
  expectMatch?: boolean;
  expected?: ReceiptExpectedValues | null;
  absentFields?: ReceiptFieldKey[];
}

export interface ReceiptExampleOrigin {
  issuerId?: string;
  templateId?: string;
  label?: string;
  expectMatch?: boolean;
}

/** Cuerpo del 400 de `POST /examples/:id/confirm`. */
export interface ReceiptConfirmError {
  statusCode?: number;
  message: string;
  missingFields?: ReceiptFieldKey[];
  requiredAbsent?: ReceiptFieldKey[];
  contradictory?: ReceiptFieldKey[];
}

export interface ReceiptFileUrl {
  url: string;
  expiresIn: number;
}

// --- Copiloto ---------------------------------------------------------------

export type ReceiptCopilotKind = 'classify' | 'rules' | 'repair';
export type ReceiptPromptKind = 'rules' | 'classify';

export interface ReceiptClassifyResult {
  exampleId: string;
  isReceipt: boolean;
  confidence: number;
  issuer: {
    existingIssuerId: string | null;
    code: string;
    name: string;
    confidence: number;
  } | null;
  template: {
    existingTemplateId: string | null;
    suggestedCode: string;
    suggestedName: string;
    kind: ReceiptTemplateKind;
    medium: ReceiptMedium;
    confidence: number;
  } | null;
  fields: ReceiptTemplateField[];
  detection: ReceiptDetection | null;
  costUsd?: number;
}

export interface ReceiptRulesResult {
  templateId: string;
  mode: 'generate' | 'repair';
  proposed: { rules: Record<string, unknown>; detection?: ReceiptDetection };
  results: {
    exampleId: string;
    expectMatch: boolean;
    ok: boolean;
    failedFields: ReceiptFieldKey[];
    reason: string | null;
  }[];
  collisionCount: number;
  blockers: ReceiptApprovalBlocker[];
  allPass: boolean;
  iterations: number;
  costUsd?: number;
}

export interface ReceiptCopilotJob<T = ReceiptClassifyResult | ReceiptRulesResult> {
  status: 'pending' | 'done' | 'error';
  kind: ReceiptCopilotKind;
  result: T | null;
  error: string | null;
  errorMessage: string | null;
}

export interface ReceiptCopilotPrompt {
  prompt: string;
  isDefault: boolean;
  default: string;
}
