export type ReconciliationDirection = 'bank-without-receipt' | 'receipt-without-bank' | 'both';

/** Evento de banco (correo/SMS/webhook) sin comprobante enlazado todavía. */
export interface ReconciliationBankEvent {
  id: string;
  sourceType: string;
  externalId?: string;
  normalized?: {
    bankId?: string;
    amount?: number;
    currency?: string;
    reference?: string;
  };
  createdAt: string;
}

/** Transacción con comprobante (OCR) pero sin respaldo bancario, hace >24h. */
export interface ReconciliationOrphanTransaction {
  id: string;
  bankId: string;
  amount: number;
  currency: string;
  reference?: string;
  transactionDate: string;
  createdAt: string;
}

export interface ReconciliationResponse {
  bankWithoutReceipt: ReconciliationBankEvent[];
  receiptWithoutBank: ReconciliationOrphanTransaction[];
}

export interface ReconciliationQuery {
  from: string;
  to: string;
  direction?: ReconciliationDirection;
}

export type DuplicateInsightItemType = 'support' | 'transaction';

export interface DuplicateInsightItem {
  type: DuplicateInsightItemType;
  id: string;
  createdAt: string;
  /** Motivo/id del soporte con el que colisionó (solo items `support`). */
  conflictWith?: string;
  summary: {
    linkStatus?: string;
    linkedTransactionId?: string;
    type?: string;
    status?: string;
    amount?: number;
    currency?: string;
    reference?: string;
    bankId?: string;
  };
}

export interface DuplicatesResponse {
  items: DuplicateInsightItem[];
  nextCursor?: string;
}

export interface DuplicatesQuery {
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export type DuplicateResolutionStatus = 'false_positive' | 'confirmed_fraud';

export interface ResolveDuplicateRequest {
  resolution: DuplicateResolutionStatus;
  notes?: string;
}
