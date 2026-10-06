import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideCheckCircle2,
  LucideCreditCard,
  LucideLoaderCircle,
  LucideRefreshCw,
} from '@lucide/angular';
import { finalize, forkJoin } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { BillingStatusService } from '../../../../core/services/billing-status.service';
import { SUPPORT_WHATSAPP_URL } from '../../../../shared/constants/legal.constants';
import type {
  SubscriptionPlanSummary,
  SubscriptionUsageMetric,
} from '../../../../shared/models/auth.models';
import type {
  AddOnPricingResponse,
  AddOnPricingTier,
  ChangePlanResponse,
  CreatePlanChangeRequestPayload,
  PlanChangeRequestSummary,
  PlanChangeRequestType,
  RecurringAddOnMetric,
} from '../../../../shared/models/billing.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import {
  blockReasonLabel,
  formatLongDate,
} from '../../../../shared/utils/billing-format';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { SubscriptionsApiService } from '../../services/subscriptions-api.service';

const REQUEST_TYPE_LABELS: Record<PlanChangeRequestType, string> = {
  upgrade: 'Cambio de plan',
  downgrade: 'Cambio de plan',
  renew_trial: 'Renovacion de prueba',
  top_up: 'Toping de WhatsApp',
  add_on: 'Add-on',
};

const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
  scheduled: 'Agendada',
  applied: 'Aplicada',
  blocked_by_usage: 'Bloqueada por uso',
};

@Component({
  selector: 'app-subscription-page',
  imports: [
    DatePipe,
    FormsModule,
    Alert,
    Button,
    Input,
    Modal,
    LucideCheckCircle2,
    LucideCreditCard,
    LucideLoaderCircle,
    LucideRefreshCw,
  ],
  templateUrl: './subscription.page.html',
  styleUrl: './subscription.page.scss',
})
export class SubscriptionPage implements OnInit {
  private readonly subscriptionsApi = inject(SubscriptionsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly billing = inject(BillingStatusService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly supportWhatsappUrl = SUPPORT_WHATSAPP_URL;

  readonly subscription = signal(this.session.subscription());
  readonly usage = signal<SubscriptionUsageMetric[]>([]);
  readonly availablePlans = signal<SubscriptionPlanSummary[]>([]);
  readonly changeRequests = signal<PlanChangeRequestSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  readonly currentPlanName = computed(() => this.subscription()?.plan.name ?? 'Sin plan');
  readonly currentPlanCode = computed(() => this.subscription()?.plan.code ?? '');
  readonly pendingRequests = computed(() =>
    this.changeRequests().filter((request) => request.status === 'pending'),
  );
  readonly isReactivating = computed(() => this.subscription()?.status !== 'active');
  readonly isPastDueOrSuspended = computed(() =>
    ['past_due', 'suspended'].includes(this.subscription()?.status ?? ''),
  );
  /** Bloqueo por cobro: el negocio no puede ver datos de pagos. */
  readonly blockedAt = computed(() => this.subscription()?.blockedAt ?? null);
  readonly blockReason = computed(() => this.subscription()?.blockReason ?? null);
  readonly blockedSinceLabel = computed(() => formatLongDate(this.blockedAt()));
  readonly blockReasonText = computed(() => blockReasonLabel(this.blockReason()));
  /**
   * La prueba gratis terminó (`suspended` con plan `free_trial`): se sale
   * eligiendo un plan, no pagando una cuenta de cobro.
   */
  readonly isTrialEnded = computed(() => {
    const subscription = this.subscription();
    if (!subscription) return false;
    return (
      subscription.blockReason === 'trial_ended' ||
      (subscription.plan.code === 'free_trial' && subscription.status === 'suspended')
    );
  });
  /** Pagar la cuenta de cobro vencida (no cambiar de plan) reactiva el servicio. */
  readonly paysInvoiceToUnblock = computed(() => this.blockReason() === 'payment_overdue');
  readonly trialEndLabel = computed(() => formatLongDate(this.subscription()?.trialEndsAt));
  readonly periodEndLabel = computed(() => formatLongDate(this.subscription()?.currentPeriodEnd));
  /** Planes que el negocio puede elegir por sí mismo (Pro+ es a la medida). */
  readonly selectablePlans = computed(() =>
    this.availablePlans().filter((plan) => !plan.isCustom),
  );

  readonly addonPricing = signal<AddOnPricingResponse | null>(null);
  readonly selectedBillingPeriod = signal<'monthly' | 'annual'>('monthly');

  readonly reportModalOpen = signal(false);
  readonly reportNote = signal('');
  readonly reporting = signal(false);

  readonly requestModalOpen = signal(false);
  readonly requestType = signal<PlanChangeRequestType>('upgrade');
  readonly selectedPlanCode = signal('');
  readonly addOnMetric = signal<RecurringAddOnMetric>('locations');
  readonly addOnQuantity = signal(1);
  readonly topUpQuantity = signal(500);
  readonly requestMessage = signal('');
  readonly submitting = signal(false);

  readonly addOnTiers = computed<AddOnPricingTier[]>(
    () => this.addonPricing()?.[this.addOnMetric()] ?? [],
  );
  readonly topUpTiers = computed<AddOnPricingTier[]>(() => this.addonPricing()?.whatsapp ?? []);

  ngOnInit(): void {
    this.load();
    this.subscriptionsApi
      .addonPricing()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (pricing) => this.addonPricing.set(pricing) });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    forkJoin({
      overview: this.subscriptionsApi.overview(),
      requests: this.subscriptionsApi.myChangeRequests(),
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ overview, requests }) => {
          this.subscription.set(overview.subscription);
          this.usage.set(overview.usage);
          this.availablePlans.set(overview.availablePlans);
          this.changeRequests.set(requests);
          this.session.updateSubscription(overview.subscription);
          void this.billing.refresh();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  isCurrentPlan(plan: SubscriptionPlanSummary): boolean {
    return plan.code === this.currentPlanCode();
  }

  boundedPercent(metric: SubscriptionUsageMetric): number {
    return Math.max(0, Math.min(metric.percent, 100));
  }

  usageLabel(metric: SubscriptionUsageMetric): string {
    if (metric.limit === -1) {
      return `${this.formatNumber(metric.used)} usados`;
    }

    return `${this.formatNumber(metric.used)} de ${this.formatNumber(metric.limit)}`;
  }

  formatPlanLimit(value: number): string {
    if (value === -1) {
      return 'A medida';
    }
    if (value === 0) {
      return 'No incluido';
    }
    return this.formatNumber(value);
  }

  priceLabel(plan: SubscriptionPlanSummary): string {
    if (plan.isCustom) {
      return 'A medida';
    }
    return `${this.formatNumber(plan.priceCop)} ${plan.currency}`;
  }

  formatCop(value: number): string {
    return `${this.formatNumber(value)} COP`;
  }

  topUpTierLabel(tier: AddOnPricingTier): string {
    return `${this.formatNumber(tier.quantity)} notificaciones — ${this.formatCop(tier.totalPriceCop)} (pago unico)`;
  }

  addOnTierLabel(tier: AddOnPricingTier): string {
    const unit = this.addOnMetric() === 'locations' ? 'sede(s)' : 'usuario(s)';
    return `${tier.quantity} ${unit} — +${this.formatCop(tier.totalPriceCop)} / mes`;
  }

  requestTypeLabel(type: PlanChangeRequestType): string {
    return REQUEST_TYPE_LABELS[type] ?? type;
  }

  requestStatusLabel(status: string): string {
    return REQUEST_STATUS_LABELS[status] ?? status;
  }

  requestSummary(request: PlanChangeRequestSummary): string {
    if (request.requestType === 'top_up' && request.topUp) {
      return `+${request.topUp.quantity} notificaciones WhatsApp`;
    }
    if (request.requestType === 'add_on' && request.recurringAddOn) {
      const label = request.recurringAddOn.metric === 'locations' ? 'sede(s)' : 'usuario(s)';
      return `+${request.recurringAddOn.quantity} ${label}`;
    }
    if (request.requestedPlanCode && request.proration) {
      const change = `${request.fromPlanCode ?? '?'} -> ${request.requestedPlanCode}`;
      return request.proration.proratedAmountCop > 0
        ? `${change} (${this.formatCop(request.proration.proratedAmountCop)} prorrateado)`
        : change;
    }
    if (request.requestedPlanCode) {
      return `Plan ${request.requestedPlanCode}`;
    }
    return '-';
  }

  planNameByCode(code: string | null | undefined): string {
    if (!code) {
      return '';
    }
    return this.availablePlans().find((plan) => plan.code === code)?.name ?? code;
  }

  scrollToPlans(): void {
    document.getElementById('subscription-plans')?.scrollIntoView({ behavior: 'smooth' });
  }

  goToInvoices(): void {
    void this.router.navigateByUrl('/invoices');
  }

  planActionLabel(plan: SubscriptionPlanSummary): string {
    if (this.isCurrentPlan(plan)) {
      return this.isTrialEnded() ? 'Prueba terminada' : 'Plan actual';
    }
    return this.isTrialEnded() ? 'Elegir este plan' : 'Solicitar cambio';
  }

  openPlanChangeModal(plan: SubscriptionPlanSummary): void {
    if (plan.isCustom) {
      return;
    }
    this.openRequestModal();
    this.requestType.set(plan.priceCop >= this.currentPlanPrice() ? 'upgrade' : 'downgrade');
    this.selectedPlanCode.set(plan.code);
  }

  openRequestModal(): void {
    this.error.set('');
    this.success.set('');
    this.requestType.set('upgrade');
    this.selectedPlanCode.set(
      this.selectablePlans().find((plan) => !this.isCurrentPlan(plan))?.code ?? '',
    );
    this.selectedBillingPeriod.set('monthly');
    this.selectAddOnMetric('locations');
    this.topUpQuantity.set(this.topUpTiers()[0]?.quantity ?? 500);
    this.requestMessage.set('');
    this.requestModalOpen.set(true);
  }

  annualPriceLabel(plan: SubscriptionPlanSummary): string | null {
    if (!plan.annualPriceCop) {
      return null;
    }
    return `${this.formatNumber(plan.annualPriceCop)} ${plan.currency} / año`;
  }

  openReportModal(): void {
    this.error.set('');
    this.reportNote.set('');
    this.reportModalOpen.set(true);
  }

  closeReportModal(): void {
    if (this.reporting()) {
      return;
    }
    this.reportModalOpen.set(false);
  }

  submitReportPayment(): void {
    this.reporting.set(true);
    this.error.set('');

    this.subscriptionsApi
      .reportPayment(this.reportNote().trim() || undefined)
      .pipe(
        finalize(() => this.reporting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.reportModalOpen.set(false);
          this.success.set(
            'Gracias, reportamos tu pago. Nuestro equipo lo confirmara pronto.',
          );
          void this.billing.refresh();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  selectAddOnMetric(metric: RecurringAddOnMetric): void {
    this.addOnMetric.set(metric);
    const tiers = this.addonPricing()?.[metric] ?? [];
    this.addOnQuantity.set(tiers[0]?.quantity ?? 1);
  }

  closeRequestModal(): void {
    if (this.submitting()) {
      return;
    }
    this.requestModalOpen.set(false);
  }

  submitRequest(): void {
    if (this.requestType() === 'upgrade' || this.requestType() === 'downgrade') {
      this.submitPlanChange();
      return;
    }

    const payload = this.buildRequestPayload();
    if (!payload) {
      return;
    }

    this.submitting.set(true);
    this.error.set('');

    this.subscriptionsApi
      .createChangeRequest(payload)
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (request) => {
          this.changeRequests.update((items) => [request, ...items]);
          this.requestModalOpen.set(false);
          this.success.set(
            'Solicitud enviada. Nuestro equipo la revisara y te avisaremos cuando este lista.',
          );
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  private submitPlanChange(): void {
    if (!this.selectedPlanCode()) {
      this.error.set('Selecciona un plan.');
      return;
    }
    if (this.availablePlans().some((plan) => plan.code === this.selectedPlanCode() && plan.isCustom)) {
      this.error.set('El plan a la medida se contrata con nuestro equipo. Escribenos para cotizarlo.');
      return;
    }

    this.submitting.set(true);
    this.error.set('');

    this.subscriptionsApi
      .changePlan(
        this.selectedPlanCode(),
        this.isReactivating() ? this.selectedBillingPeriod() : undefined,
      )
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.requestModalOpen.set(false);
          this.success.set(this.formatChangePlanMessage(result));
          this.load();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  private formatChangePlanMessage(result: ChangePlanResponse): string {
    const periodEndLabel = result.currentPeriodEnd
      ? new Date(result.currentPeriodEnd).toLocaleDateString('es-CO', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '';

    if (result.type === 'same_plan') {
      return 'Ya tienes este plan.';
    }

    if (result.type === 'downgrade') {
      return `Tu plan cambiara a ${result.newPlan.name} a partir del ${periodEndLabel}, sin cobro ahora. Hasta entonces conservas tu plan actual.`;
    }

    if (result.paymentRequired) {
      if (this.isReactivating()) {
        const cycleLabel = this.selectedBillingPeriod() === 'annual' ? 'anual' : 'mensual';
        return (
          `Se genero una cuenta de cobro por ${this.formatCop(result.proratedAmountCop)} (ciclo ${cycleLabel}). ` +
          `Tu plan ${result.newPlan.name} se activara apenas confirmemos el pago.`
        );
      }
      return (
        `Se genero una cuenta de cobro por ${this.formatCop(result.proratedAmountCop)} por los dias restantes de tu periodo actual. ` +
        `Tu plan cambiara a ${result.newPlan.name} apenas se confirme el pago. ` +
        `Tu proxima renovacion sigue siendo el ${periodEndLabel}, por ${this.formatCop(result.newPlan.priceCop)}.`
      );
    }

    return `Tu plan cambio a ${result.newPlan.name}.`;
  }

  private buildRequestPayload(): CreatePlanChangeRequestPayload | null {
    const requestType = this.requestType();
    const message = this.requestMessage().trim() || undefined;

    if (requestType === 'top_up') {
      const quantity = Number(this.topUpQuantity());
      if (!quantity || quantity < 1) {
        this.error.set('Indica cuantas notificaciones quieres comprar.');
        return null;
      }
      return { requestType, topUpQuantity: quantity, message };
    }

    if (requestType === 'add_on') {
      const quantity = Number(this.addOnQuantity());
      if (!quantity || quantity < 1) {
        this.error.set('Indica la cantidad.');
        return null;
      }
      return {
        requestType,
        addOnMetric: this.addOnMetric(),
        addOnQuantity: quantity,
        message,
      };
    }

    return null;
  }

  private currentPlanPrice(): number {
    return this.subscription()?.plan.priceCop ?? 0;
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('es-CO').format(value);
  }
}
