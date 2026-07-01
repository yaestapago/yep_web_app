export type MechanismKind =
  | 'ocr_extraction'
  | 'whatsapp_inbound'
  | 'bank_webhook'
  | 'bank_api'
  | 'bank_sms'
  | 'manual'
  | 'support_aggregation';

export type TransactionStatus =
  | 'CREATED'
  | 'PENDING_VERIFICATION'
  | 'EVIDENCE_MATCHED'
  | 'BANK_VERIFIED'
  | 'MANUALLY_VERIFIED'
  | 'REJECTED'
  | 'DUPLICATE'
  | 'NEEDS_REVIEW'
  | 'CANCELLED';

export type VerificationLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'MANUAL';

export interface TransactionParty {
  name?: string;
  account?: string;
}

export interface VerificationSnapshot {
  status: TransactionStatus;
  level: VerificationLevel;
  canBeConsideredPaid: boolean;
  lastRunId?: string;
  lastRunAt?: string;
}

export type ManualReviewDecision = 'confirmed' | 'rejected';

export interface ManualReview {
  decision: ManualReviewDecision;
  byUserId: string;
  at: string;
  note?: string;
}

export interface ManualDecisionRequest {
  decision: ManualReviewDecision;
  note?: string;
}

export interface PaymentTransaction {
  id: string;
  accountId: string;
  locationId?: string;
  bankId: string;
  transactionDate: string;
  amount: number;
  currency: string;
  reference?: string;
  sender?: TransactionParty;
  receiver?: TransactionParty;
  customerId?: string;
  dayBucket: string;
  status: TransactionStatus;
  verification: VerificationSnapshot;
  createdByMechanismId: string;
  createdBySourceEventId?: string;
  manualReview?: ManualReview;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionRequest {
  bankId: string;
  transactionDate: string;
  amount: number;
  currency?: string;
  reference?: string;
  locationId?: string;
  sender?: TransactionParty;
  receiver?: TransactionParty;
  mechanismKind?: MechanismKind;
  sourceEventId?: string;
  externalId?: string;
  fileHash?: string;
  notes?: string;
}

export interface TransactionsResponse {
  transactions: PaymentTransaction[];
  nextCursor?: string;
}

export interface TransactionResponse {
  transaction: PaymentTransaction;
}

export interface CreateTransactionResponse extends TransactionResponse {
  action: 'CREATED' | 'RETURNED_EXISTING' | 'DUPLICATE_DETECTED';
}

export interface TransactionQuery {
  from?: string;
  to?: string;
  bankId?: string;
  locationId?: string;
  status?: TransactionStatus;
  /** Varios estados (CSV), para filtrar por categoría amigable. */
  statuses?: string;
  level?: VerificationLevel;
  amountMin?: number;
  amountMax?: number;
  reference?: string;
  /** Búsqueda por referencia (prefijo). */
  q?: string;
  cursor?: string;
  limit?: number;
}

/** Filtros aplicables a la lista de transacciones (sin paginación). */
export type TransactionFilters = Pick<
  TransactionQuery,
  'from' | 'to' | 'bankId' | 'statuses' | 'amountMin' | 'amountMax' | 'q'
>;

export type PaymentSupportType =
  | 'OCR_RECEIPT'
  | 'BANK_SMS'
  | 'BANK_WEBHOOK'
  | 'BANK_STATEMENT'
  | 'MANUAL_ENTRY';

export interface PaymentSupportFile {
  url?: string;
  hash?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface PaymentSupportExtracted {
  bankId?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  transactionDate?: string;
  sender?: TransactionParty;
  receiver?: TransactionParty;
  confidence?: number;
  rawText?: string;
}

export interface PaymentSupport {
  id: string;
  accountId: string;
  locationId?: string;
  type: PaymentSupportType;
  linkedTransactionId?: string;
  linkStatus: 'LINKED' | 'UNLINKED' | 'DUPLICATE';
  sourceEventId?: string;
  mechanismId: string;
  file?: PaymentSupportFile;
  extracted?: PaymentSupportExtracted;
  duplicateReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSupportsResponse {
  paymentSupports: PaymentSupport[];
}

export interface AttachSupportRequest {
  type: PaymentSupportType;
  mechanismKind?: MechanismKind;
  locationId?: string;
  sourceEventId?: string;
  file?: PaymentSupportFile;
  extracted?: PaymentSupportExtracted;
}

export interface AttachSupportResponse {
  action: 'CREATED' | 'DUPLICATE_DETECTED';
  paymentSupport: PaymentSupport;
  duplicateOf?: string;
}
