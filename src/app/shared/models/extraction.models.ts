import { TransactionParty } from './transaction.models';

export interface TransactionExtraction {
  isTransactionReceipt: boolean;
  bank: string | null;
  amount: number | null;
  currency: string | null;
  dateTime: string | null;
  sender: NullableTransactionParty;
  receiver: NullableTransactionParty;
  reference: string | null;
  status: string | null;
  confidence: number;
  rawText: string | null;
}

export interface NullableTransactionParty {
  name: string | null;
  account: string | null;
}

/**
 * El comprobante ya guardado (`receipts/{accountId}/…`). Se reenvía tal cual como
 * `file` del soporte y su `hash` como `fileHash` al crear la transacción. Sin
 * almacenamiento configurado llega sin `key`.
 */
export interface ExtractedReceiptFile {
  key?: string;
  hash: string;
  mimeType: string;
  sizeBytes: number;
}

export interface TransactionExtractionResponse {
  transaction: TransactionExtraction;
  model: string;
  file?: ExtractedReceiptFile;
  diagnostics?: {
    timingsMs: {
      total: number;
      openAi: number;
      textract?: number;
    };
    openAiUsage?: {
      inputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
    };
    estimatedOpenAiCostUsd?: number | null;
    pricingBasis?: {
      model: string;
      inputUsdPer1MTokens: number;
      outputUsdPer1MTokens: number;
      note: string;
    } | null;
  };
}

export function nullablePartyToRequestParty(party: NullableTransactionParty): TransactionParty | undefined {
  const normalized = {
    name: party.name ?? undefined,
    account: party.account ?? undefined,
  };

  return normalized.name || normalized.account ? normalized : undefined;
}
