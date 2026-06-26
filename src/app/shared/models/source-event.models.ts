export type SourceEventType =
  | 'WHATSAPP_INBOUND'
  | 'OCR_UPLOAD'
  | 'BANK_SMS'
  | 'BANK_WEBHOOK'
  | 'BANK_API_POLL'
  | 'MANUAL_ENTRY'
  | 'NOTIFIER_APP'
  | 'EMAIL_GMAIL';

export type SourceEventStatus = 'received' | 'processing' | 'processed' | 'failed' | 'ignored';

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
  createdAt: string;
  updatedAt: string;
}

export interface SourceEventsResponse {
  sourceEvents: SourceEvent[];
  nextCursor?: string;
}

export interface SourceEventQuery {
  cursor?: string;
  limit?: number;
  sourceType?: SourceEventType;
  status?: SourceEventStatus;
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
  'sourceType' | 'status' | 'bankId' | 'from' | 'to' | 'q'
>;

export interface IngestSourceEventRequest {
  sourceType: SourceEventType;
  externalId?: string;
  locationId?: string;
  rawPayload: Record<string, unknown>;
  normalized?: SourceEventNormalized;
}
