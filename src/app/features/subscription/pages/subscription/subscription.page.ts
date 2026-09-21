import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  LucideCheckCircle2,
  LucideCreditCard,
  LucideLoaderCircle,
  LucideRefreshCw,
} from '@lucide/angular';
import { finalize, forkJoin } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type {
  SubscriptionPlanSummary,
  SubscriptionUsageMetric,
} from '../../../../shared/models/auth.models';
import type {
  CreatePlanChangeRequestPayload,
  PlanChangeRequestSummary,
  PlanChangeRequestType,
  RecurringAddOnMetric,
} from '../../../../shared/models/billing.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
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
  private readonly destroyRef = inject(DestroyRef);

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

  readonly requestModalOpen = signal(false);
  readonly requestType = signal<PlanChangeRequestType>('upgrade');
  readonly selectedPlanCode = signal('');
  readonly addOnMetric = signal<RecurringAddOnMetric>('locations');
  readonly addOnQuantity = signal(1);
  readonly topUpQuantity = signal(500);
  readonly requestMessage = signal('');
  readonly submitting = signal(false);

  ngOnInit(): void {
    this.load();
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
    if (request.requestedPlanCode) {
      return `Plan ${request.requestedPlanCode}`;
    }
    return '-';
  }

  openPlanChangeModal(plan: SubscriptionPlanSummary): void {
    this.openRequestModal();
    this.requestType.set(plan.priceCop >= this.currentPlanPrice() ? 'upgrade' : 'downgrade');
    this.selectedPlanCode.set(plan.code);
  }

  openRequestModal(): void {
    this.error.set('');
    this.success.set('');
    this.requestType.set('upgrade');
    this.selectedPlanCode.set(
      this.availablePlans().find((plan) => !this.isCurrentPlan(plan))?.code ?? '',
    );
    this.addOnMetric.set('locations');
    this.addOnQuantity.set(1);
    this.topUpQuantity.set(500);
    this.requestMessage.set('');
    this.requestModalOpen.set(true);
  }

  closeRequestModal(): void {
    if (this.submitting()) {
      return;
    }
    this.requestModalOpen.set(false);
  }

  submitRequest(): void {
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

  private buildRequestPayload(): CreatePlanChangeRequestPayload | null {
    const requestType = this.requestType();
    const message = this.requestMessage().trim() || undefined;

    if (requestType === 'upgrade' || requestType === 'downgrade') {
      if (!this.selectedPlanCode()) {
        this.error.set('Selecciona un plan.');
        return null;
      }
      return { requestType, requestedPlanCode: this.selectedPlanCode(), message };
    }

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
