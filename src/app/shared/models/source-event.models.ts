export type SourceEventType =
  | 'WHATSAPP_INBOUND'
  | 'OCR_UPLOAD'
  | 'BANK_SMS'
  | 'BANK_WEBHOOK'
  | 'BANK_API_POLL'
  | 'MANUAL_ENTRY'
  | 'NOTIFIER_APP';

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
  externalId?: string;
  rawPayload: Record<string, unknown>;
  normalized?: SourceEventNormalized;
  status: SourceEventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SourceEventsResponse {
  sourceEvents: SourceEvent[];
}

export interface IngestSourceEventRequest {
  sourceType: SourceEventType;
  externalId?: string;
  locationId?: string;
  rawPayload: Record<string, unknown>;
  normalized?: SourceEventNormalized;
}
