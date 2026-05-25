export type CustomerSort = 'totalPaidAmount' | 'lastSeenAt' | 'transactionCount';

export interface Customer {
  id: string;
  accountId: string;
  displayName?: string;
  account?: string;
  bankId?: string;
  transactionCount: number;
  totalPaidAmount: number;
  lastSeenAt?: string;
  flaggedSuspicious: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomersResponse {
  customers: Customer[];
}
