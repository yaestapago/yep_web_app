import type { TransactionDateSource } from './bank.models';

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
  /** Origen de `transactionDate`; 'text' = el banco la declaró en el propio cuerpo del mensaje. */
  transactionDateSource?: TransactionDateSource;
  senderName?: string;
  senderAccount?: string;
  receiverAccount?: string;
  receiverBreBKey?: string;
  /** Llave Bre-B tal como se detectó (con `@`/mayúsculas originales); usar esta para mostrar al usuario. */
  receiverBreBKeyDisplay?: string;
  reportedBankAccountId?: string;
  reportedBankAccountResolution?: string;
}

/** Cuenta YEP a la que el backend enlazó el evento (por política de resolución). */
export interface ReportedBankAccountView {
  id: string;
  bankId: string;
  displayName?: string;
  holderName?: string;
  accountNumberLast4: string;
}

/**
 * Estado del comprobante (recibo) de la transacción enlazada a este evento.
 * `none` cubre tanto "sin transacción enlazada" como "enlazada pero sin
 * comprobante todavía". `duplicate` = el comprobante coincide con el de otra
 * transacción (ver /insights/duplicates).
 */
export interface SourceEventReceipt {
  status: 'none' | 'linked' | 'duplicate';
  paymentSupportId?: string;
  transactionId?: string;
}

export interface SourceEvent {
  id: string;
  accountId: string;
  sourceType: SourceEventType;
  notifierId?: string;
  reportedBankAccountId?: string;
  /** Solo en el detalle: datos de la cuenta YEP resuelta (nombre + últimos 4). */
  reportedBankAccount?: ReportedBankAccountView | null;
  externalId?: string;
  rawPayload: Record<string, unknown>;
  normalized?: SourceEventNormalized;
  status: SourceEventStatus;
  linkedTransactionId?: string;
  /**
   * Solo en el push SSE del evento de banco recién creado: `true` = primer
   * reporte de este pago (se anuncia por voz); `false` = otro notificador
   * corrobora un pago ya reportado (nunca suena). Ausente = no se sabe
   * (backend anterior, respuestas GET, reemisiones por cambio de estado): el
   * cliente cae a su propia deduplicación por evento/transacción.
   */
  firstReport?: boolean;
  /**
   * Emisión temprana: el enlace con la transacción tardaba (> ~3 s) y el
   * backend mostró el evento antes de saber si es primer reporte (sin
   * `firstReport` y, normalmente, sin `linkedTransactionId`). Después llega el
   * anuncio final del MISMO id con `firstReport` y el enlace; la voz espera a
   * ese anuncio para decidir.
   */
  linkPending?: boolean;
  linkedSupportId?: string;
  receipt?: SourceEventReceipt;
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
