export type PlanChangeRequestType = 'upgrade' | 'downgrade' | 'renew_trial' | 'top_up' | 'add_on';

export type PlanChangeRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'scheduled'
  | 'applied'
  | 'blocked_by_usage';

export type RecurringAddOnMetric = 'locations' | 'users';

export interface PlanTopUpSummary {
  metric: string;
  quantity: number;
  expiresAt?: string;
}

export interface RecurringAddOnSummary {
  metric: RecurringAddOnMetric;
  quantity: number;
  unitPriceCop: number;
  totalPriceCop: number;
}

export interface PlanChangeRequestSummary {
  id: string;
  accountId: string;
  accountName?: string | null;
  requestType: PlanChangeRequestType;
  requestedPlanCode?: string;
  topUp?: PlanTopUpSummary;
  recurringAddOn?: RecurringAddOnSummary;
  status: PlanChangeRequestStatus;
  message?: string;
  reviewNote?: string;
  reviewedAt?: string;
  effectiveAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanChangeRequestPayload {
  requestType: PlanChangeRequestType;
  requestedPlanCode?: string;
  topUpQuantity?: number;
  addOnMetric?: RecurringAddOnMetric;
  addOnQuantity?: number;
  message?: string;
}

export interface ReviewPlanChangeRequestPayload {
  reviewNote?: string;
  finalPriceCop?: number;
}

export type BillingInvoiceStatus = 'issued' | 'paid' | 'cancelled';

export interface BillingInvoiceItemSummary {
  description: string;
  quantity: number;
  unitPriceCop: number;
  totalCop: number;
}

export interface BillingInvoiceSummary {
  id: string;
  accountId: string;
  invoiceNumber: string;
  sellerName: string;
  sellerRut: string;
  buyerName: string;
  buyerIdentification?: string;
  buyerEmail?: string;
  concept: string;
  items: BillingInvoiceItemSummary[];
  totalCop: number;
  status: BillingInvoiceStatus;
  issuedAt: string;
  paidAt?: string;
  notes?: string;
}
