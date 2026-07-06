export type SourceEventType =
  | 'WHATSAPP_INBOUND'
  | 'OCR_UPLOAD'
  | 'BANK_SMS'
  | 'BANK_WEBHOOK'
  | 'BANK_API_POLL'
  | 'MANUAL_ENTRY'
  | 'NOTIFIER_APP'
  | 'EMAIL_GMAIL';

export type SourceEventStatus =
  | 'received'
  | 'processing'
  | 'processed'
  | 'needs_review'
  | 'failed'
  | 'ignored';

export interface SourceEventNormalized {
  bankId?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  transactionDate?: string;
  senderAccount?: string;
  receiverAccount?: string;
}

export interface SourceEvent {
  id: string;
  accountId: string;
  sourceType: SourceEventType;
  notifierId?: string;
  reportedBankAccountId?: string;
  externalId?: string;
  rawPayload: Record<string, unknown>;
  normalized?: SourceEventNormalized;
  status: SourceEventStatus;
  linkedTransactionId?: string;
  linkedSupportId?: string;
  processedAt?: string;
  error?: string;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceEventsResponse {
  sourceEvents: SourceEvent[];
  nextCursor?: string;
}

export interface SourceEventResponse {
  sourceEvent: SourceEvent;
}

export interface SourceEventQuery {
  cursor?: string;
  limit?: number;
  sourceType?: SourceEventType;
  sourceTypes?: SourceEventType[];
  status?: SourceEventStatus;
  statuses?: SourceEventStatus[];
  /** Banco/plataforma normalizado (ej. "bancolombia"). */
  bankId?: string;
  /** Rango sobre createdAt (ISO 8601). */
  from?: string;
  to?: string;
  /** Búsqueda por referencia/ID (prefijo). */
  q?: string;
}

/** Filtros aplicables a la lista de eventos (sin paginación). */
export type SourceEventFilters = Pick<
  SourceEventQuery,
  'sourceType' | 'sourceTypes' | 'status' | 'statuses' | 'bankId' | 'from' | 'to' | 'q'
>;

export interface IngestSourceEventRequest {
  sourceType: SourceEventType;
  externalId?: string;
  locationId?: string;
  rawPayload: Record<string, unknown>;
  normalized?: SourceEventNormalized;
}
