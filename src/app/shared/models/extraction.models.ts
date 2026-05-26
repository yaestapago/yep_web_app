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

export interface TransactionExtractionResponse {
  transaction: TransactionExtraction;
  model: string;
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
