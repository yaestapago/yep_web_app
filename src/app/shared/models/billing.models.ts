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

export interface AddOnPricingTier {
  quantity: number;
  unitPriceCop: number;
  totalPriceCop: number;
}

export interface AddOnPricingResponse {
  whatsapp: AddOnPricingTier[];
  locations: AddOnPricingTier[];
  users: AddOnPricingTier[];
}

export interface PlanChangeProrationSummary {
  fromPriceCop: number;
  toPriceCop: number;
  periodStart: string;
  periodEnd: string;
  remainingFraction: number;
  proratedAmountCop: number;
}

export interface PlanChangeRequestSummary {
  id: string;
  accountId: string;
  accountName?: string | null;
  requestType: PlanChangeRequestType;
  fromPlanCode?: string;
  requestedPlanCode?: string;
  topUp?: PlanTopUpSummary;
  recurringAddOn?: RecurringAddOnSummary;
  proration?: PlanChangeProrationSummary;
  billingPeriod?: 'monthly' | 'annual';
  status: PlanChangeRequestStatus;
  message?: string;
  reviewNote?: string;
  reviewedAt?: string;
  effectiveAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChangePlanPayload {
  planCode: string;
  billingPeriod?: 'monthly' | 'annual';
}

export interface ChangePlanResponse {
  type: 'same_plan' | 'upgrade' | 'downgrade';
  currentPlan: { code: string; name: string; priceCop: number };
  newPlan: { code: string; name: string; priceCop: number };
  currentPeriodEnd: string | null;
  proratedAmountCop: number;
  currency: 'COP';
  paymentRequired: boolean;
  changeRequestId: string | null;
  invoiceId: string | null;
}

export interface ReportPaymentPayload {
  note?: string;
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

export type BillingInvoiceStatus = 'issued' | 'reported' | 'paid' | 'cancelled';

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
  reportedAt?: string;
  customerNote?: string;
  notes?: string;
}
