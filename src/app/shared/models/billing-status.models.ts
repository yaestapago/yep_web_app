/**
 * Estado de cobro de un negocio (bloqueo por falta de pago) y vista operativa
 * "Clientes y cobros". Contrato con el backend:
 * - `GET /subscriptions/billing-status` (cualquier miembro aprobado, con
 *   `x-business-account-id`).
 * - `GET /admin/billing/customers` (solo `account_su` y `support`).
 * - HTTP 402 `BUSINESS_BILLING_BLOCKED` en los endpoints con datos de pagos.
 */

export type BillingBlockReason = 'trial_ended' | 'payment_overdue' | 'subscription_ended';
export type BillingPhase = 'trial' | 'paid' | 'none';
export type BillingState = 'ok' | 'due_soon' | 'payment_review' | 'blocked';
export type BillingStatusInvoiceStatus = 'issued' | 'reported' | 'paid' | 'cancelled';

export const BUSINESS_BILLING_BLOCKED_CODE = 'BUSINESS_BILLING_BLOCKED';

/** Cuerpo del 402 que devuelve el backend cuando el negocio está bloqueado. */
export interface BusinessBillingBlockedError {
  statusCode: 402;
  code: typeof BUSINESS_BILLING_BLOCKED_CODE;
  message: string;
  reason: BillingBlockReason;
  blockedAt: string | null;
  businessAccountId: string;
  subscriptionUrl: string;
}

export interface BillingStatusInvoice {
  id: string;
  invoiceNumber: string;
  totalCop: number;
  status: BillingStatusInvoiceStatus;
}

export interface BillingStatusResponse {
  businessAccountId: string;
  phase: BillingPhase;
  /** `due_soon` = fecha límite dentro de 5 días y sin pago reportado/confirmado. */
  state: BillingState;
  reason: BillingBlockReason | null;
  deadline: string | null;
  daysLeft: number | null;
  blockedAt: string | null;
  isOwner: boolean;
  planName: string | null;
  currentInvoice: BillingStatusInvoice | null;
  /**
   * Fecha de corte (ISO): fin de la prueba o del ciclo pagado en curso. Mes
   * adelantado: para esa fecha la cuenta de cobro del ciclo siguiente ya debe
   * estar paga. Opcional por compatibilidad con backends anteriores.
   */
  cutoffDate?: string | null;
  billingPeriod?: BillingPeriod;
  /** Cambio mensual ↔ anual agendado; entra en `pendingBillingPeriodEffectiveAt`. */
  pendingBillingPeriod?: BillingPeriod | null;
  pendingBillingPeriodEffectiveAt?: string | null;
}

export type BillingPeriod = 'monthly' | 'annual';

/** `PATCH /admin/billing/businesses/:businessAccountId/cutoff` (solo `account_su`). */
export interface AdjustCutoffPayload {
  /** `YYYY-MM-DD`; el backend la toma a las 00:00 de Bogotá. No puede ser anterior a hoy. */
  cutoffDate: string;
  /** Motivo (auditoría), máximo 300 caracteres. */
  note?: string;
}

export interface AdjustCutoffResponse {
  businessAccountId: string;
  phase: BillingPhase;
  state: BillingState;
  /** trialing | active | past_due | suspended | cancelled | expired */
  status: string;
  cutoffDate: string;
  deadline: string | null;
  daysLeft: number | null;
  blockedAt: string | null;
  currentInvoice: BillingStatusInvoice | null;
}

export function isBusinessBillingBlockedError(body: unknown): body is BusinessBillingBlockedError {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const candidate = body as Partial<BusinessBillingBlockedError>;
  return (
    candidate.code === BUSINESS_BILLING_BLOCKED_CODE &&
    typeof candidate.businessAccountId === 'string' &&
    candidate.businessAccountId.length > 0
  );
}

// --- Vista operativa "Clientes y cobros" -----------------------------------

export type BillingNoticeKind = 'reminder_5d' | 'reminder_2d' | 'blocked' | 'payment_confirmed';
export type BillingNoticeChannelStatus = 'sent' | 'failed' | 'skipped';

export interface BillingNoticeChannelResult {
  status: BillingNoticeChannelStatus;
  reason: string | null;
}

export interface BillingCustomerNotice {
  kind: BillingNoticeKind;
  createdAt: string;
  recipientName: string;
  whatsapp: BillingNoticeChannelResult;
  email: BillingNoticeChannelResult;
}

export interface BillingCustomerOwner {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface BillingCustomerInvoice {
  id: string;
  invoiceNumber: string;
  totalCop: number;
  status: string;
}

export interface BillingCustomerRow {
  accountId: string;
  businessName: string;
  planCode: string;
  planName: string;
  phase: BillingPhase;
  /** trialing | active | past_due | suspended | cancelled | expired */
  status: string;
  state: BillingState;
  reason: string | null;
  deadline: string | null;
  daysLeft: number | null;
  blockedAt: string | null;
  contractedPriceCop: number;
  billingPeriod: 'monthly' | 'annual';
  currentInvoice: BillingCustomerInvoice | null;
  owners: BillingCustomerOwner[];
  notices: BillingCustomerNotice[];
}

export interface BillingCustomersTotals {
  total: number;
  trial: number;
  dueSoon: number;
  paymentReview: number;
  blocked: number;
  active: number;
}

export interface BillingCustomersResponse {
  generatedAt: string;
  totals: BillingCustomersTotals;
  rows: BillingCustomerRow[];
}
