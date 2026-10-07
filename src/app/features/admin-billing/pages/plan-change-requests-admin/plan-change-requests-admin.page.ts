import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideLoaderCircle, LucidePlus, LucideRefreshCw } from '@lucide/angular';
import { finalize } from 'rxjs';

import type {
  AdminPlanAssignmentAccount,
  AdminPlanAssignmentPlan,
  PlanChangeRequestStatus,
  PlanChangeRequestSummary,
  PlanChangeRequestType,
} from '../../../../shared/models/billing.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { Radio } from '../../../../shared/ui/radio/radio';
import { Select, SelectOption } from '../../../../shared/ui/select/select';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AdminPlanChangeRequestsApiService } from '../../services/admin-plan-change-requests-api.service';

const REQUEST_TYPE_LABELS: Record<PlanChangeRequestType, string> = {
  upgrade: 'Cambio de plan',
  downgrade: 'Cambio de plan',
  renew_trial: 'Renovacion de prueba',
  top_up: 'Toping de WhatsApp',
  add_on: 'Add-on',
};

@Component({
  selector: 'app-plan-change-requests-admin-page',
  imports: [
    DatePipe,
    FormsModule,
    Alert,
    Button,
    Input,
    Modal,
    Radio,
    Select,
    LucideLoaderCircle,
    LucidePlus,
    LucideRefreshCw,
  ],
  templateUrl: './plan-change-requests-admin.page.html',
  styleUrl: './plan-change-requests-admin.page.scss',
})
export class PlanChangeRequestsAdminPage implements OnInit {
  private readonly api = inject(AdminPlanChangeRequestsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notifications = inject(NotificationModalService);

  readonly requests = signal<PlanChangeRequestSummary[]>([]);
  readonly loading = signal(false);
  readonly actingId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly statusFilter = signal<PlanChangeRequestStatus | 'all'>('pending');
  readonly statusOptions: Array<PlanChangeRequestStatus | 'all'> = [
    'pending',
    'applied',
    'rejected',
    'all',
  ];

  readonly approvingRequest = signal<PlanChangeRequestSummary | null>(null);
  readonly approveNote = signal('');
  readonly approvePrice = signal<number | null>(null);
  readonly approving = signal(false);

  readonly assignmentOpen = signal(false);
  readonly assignmentOptionsLoading = signal(false);
  readonly assignmentSubmitting = signal(false);
  readonly assignmentError = signal('');
  readonly assignmentAccounts = signal<AdminPlanAssignmentAccount[]>([]);
  readonly assignmentPlans = signal<AdminPlanAssignmentPlan[]>([]);
  readonly assignmentAccountId = signal('');
  readonly assignmentPlanCode = signal('');
  readonly assignmentBillingPeriod = signal<'monthly' | 'annual'>('monthly');
  readonly assignmentMessage = signal('');
  readonly assignmentApplyImmediately = signal(false);

  readonly accountOptions = computed<SelectOption[]>(() =>
    this.assignmentAccounts().map((account) => ({
      id: account.id,
      label: account.name,
      secondLabel: account.currentPlanName ?? account.currentPlanCode ?? 'Sin plan',
      disabled: account.hasPendingChangeRequest,
    })),
  );
  readonly planOptions = computed<SelectOption[]>(() =>
    this.assignmentPlans().map((plan) => ({
      id: plan.code,
      label: plan.name,
      secondLabel: plan.isCustom ? 'Precio personalizado' : this.planPriceLabel(plan),
      disabled: plan.code === this.selectedAssignmentAccount()?.currentPlanCode,
    })),
  );
  readonly selectedAssignmentAccount = computed(() =>
    this.assignmentAccounts().find((account) => account.id === this.assignmentAccountId()),
  );
  readonly selectedAssignmentPlan = computed(() =>
    this.assignmentPlans().find((plan) => plan.code === this.assignmentPlanCode()),
  );
  readonly assignmentValid = computed(
    () =>
      !!this.selectedAssignmentAccount() &&
      !!this.selectedAssignmentPlan() &&
      !!this.assignmentMessage().trim(),
  );

  readonly filteredRequests = computed(() => {
    const filter = this.statusFilter();
    const items = this.requests();
    return filter === 'all' ? items : items.filter((r) => r.status === filter);
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.assignmentError.set('');

    this.api
      .list()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (requests) => this.requests.set(requests),
        error: (error) => this.assignmentError.set(httpErrorMessage(error)),
      });
  }

  openAssignment(): void {
    this.resetAssignment();
    this.assignmentOpen.set(true);
    this.assignmentOptionsLoading.set(true);
    this.error.set('');

    this.api
      .assignmentOptions()
      .pipe(
        finalize(() => this.assignmentOptionsLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ accounts, plans }) => {
          this.assignmentAccounts.set(accounts);
          this.assignmentPlans.set(plans);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  closeAssignment(): void {
    if (!this.assignmentSubmitting()) {
      this.assignmentOpen.set(false);
    }
  }

  selectAssignmentAccount(value: string | number | (string | number)[] | null): void {
    this.assignmentAccountId.set(typeof value === 'string' ? value : '');
    this.assignmentPlanCode.set('');
    const period = this.selectedAssignmentAccount()?.billingPeriod;
    this.assignmentBillingPeriod.set(period === 'annual' ? 'annual' : 'monthly');
  }

  selectAssignmentPlan(value: string | number | (string | number)[] | null): void {
    this.assignmentPlanCode.set(typeof value === 'string' ? value : '');
  }

  submitAssignment(applyImmediately: boolean): void {
    const account = this.selectedAssignmentAccount();
    const plan = this.selectedAssignmentPlan();
    const message = this.assignmentMessage().trim();
    if (!account || !plan || !message) {
      this.assignmentError.set('Selecciona un negocio, un plan y escribe el motivo del cambio.');
      return;
    }

    const currentPlan = this.assignmentPlans().find(
      (candidate) => candidate.code === account.currentPlanCode,
    );
    const requestType =
      !currentPlan || plan.priceCop >= currentPlan.priceCop ? 'upgrade' : 'downgrade';

    this.assignmentSubmitting.set(true);
    this.assignmentApplyImmediately.set(applyImmediately);
    this.assignmentError.set('');
    this.success.set('');
    this.api
      .create({
        accountId: account.id,
        requestType,
        requestedPlanCode: plan.code,
        billingPeriod: this.assignmentBillingPeriod(),
        message,
        applyImmediately,
      })
      .pipe(
        finalize(() => this.assignmentSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ request }) => {
          this.requests.update((items) => [
            request,
            ...items.filter((item) => item.id !== request.id),
          ]);
          this.assignmentOpen.set(false);
          this.success.set(
            applyImmediately
              ? 'El cambio de plan fue procesado por administración.'
              : 'La solicitud administrativa fue creada.',
          );
        },
        error: (error) => this.assignmentError.set(httpErrorMessage(error)),
      });
  }

  planPriceLabel(plan: AdminPlanAssignmentPlan): string {
    const monthly = this.formatCop(plan.priceCop);
    return plan.annualPriceCop
      ? `${monthly} / mes · ${this.formatCop(plan.annualPriceCop)} / año`
      : `${monthly} / mes`;
  }

  requestTypeLabel(type: PlanChangeRequestType): string {
    return REQUEST_TYPE_LABELS[type] ?? type;
  }

  requestSummary(request: PlanChangeRequestSummary): string {
    if (request.requestType === 'top_up' && request.topUp) {
      return `+${request.topUp.quantity} notificaciones WhatsApp`;
    }
    if (request.requestType === 'add_on' && request.recurringAddOn) {
      const label = request.recurringAddOn.metric === 'locations' ? 'sede(s)' : 'usuario(s)';
      return `+${request.recurringAddOn.quantity} ${label} (sugerido: ${this.formatCop(request.recurringAddOn.totalPriceCop)})`;
    }
    if (request.requestedPlanCode && request.proration) {
      const change = `${request.fromPlanCode ?? '?'} -> ${request.requestedPlanCode}`;
      return request.proration.proratedAmountCop > 0
        ? `${change} (${this.formatCop(request.proration.proratedAmountCop)} prorrateado — se cobra via factura)`
        : `${change} (sin cobro)`;
    }
    if (request.requestedPlanCode) {
      return `Plan ${request.requestedPlanCode}`;
    }
    return '-';
  }

  suggestedPriceCop(request: PlanChangeRequestSummary): number | null {
    return request.recurringAddOn?.totalPriceCop ?? null;
  }

  openApprove(request: PlanChangeRequestSummary): void {
    this.approvingRequest.set(request);
    this.approveNote.set('');
    this.approvePrice.set(this.suggestedPriceCop(request));
  }

  closeApprove(): void {
    if (this.approving()) {
      return;
    }
    this.approvingRequest.set(null);
  }

  confirmApprove(): void {
    const request = this.approvingRequest();
    if (!request) {
      return;
    }

    this.approving.set(true);
    this.error.set('');

    const finalPriceCop = this.approvePrice();
    this.api
      .approve(request.id, {
        reviewNote: this.approveNote().trim() || undefined,
        finalPriceCop: finalPriceCop != null ? Number(finalPriceCop) : undefined,
      })
      .pipe(
        finalize(() => this.approving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ request: updated, invoice }) => {
          this.updateRequestInList(updated);
          this.approvingRequest.set(null);
          // Mes adelantado: un add-on suele ir incluido en la cuenta de cobro
          // del próximo ciclo; solo se genera una aparte si esa ya se pagó.
          this.success.set(
            invoice
              ? 'Solicitud aprobada y cuenta de cobro generada.'
              : updated.requestType === 'add_on'
                ? 'Solicitud aprobada. Se cobra en la cuenta de cobro del próximo ciclo.'
                : 'Solicitud aprobada.',
          );
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  async reject(request: PlanChangeRequestSummary): Promise<void> {
    const confirmed = await this.notifications.confirm({
      title: 'Rechazar solicitud',
      message: `Se rechazara la solicitud de ${request.accountName ?? request.accountId}.`,
      type: 'warning',
      confirmText: 'Rechazar',
    });
    if (!confirmed) {
      return;
    }

    this.actingId.set(request.id);
    this.error.set('');

    this.api
      .reject(request.id, {})
      .pipe(
        finalize(() => this.actingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.updateRequestInList(updated);
          this.success.set('Solicitud rechazada.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  formatCop(value: number): string {
    return `${new Intl.NumberFormat('es-CO').format(value)} COP`;
  }

  private updateRequestInList(updated: PlanChangeRequestSummary): void {
    this.requests.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
  }

  private resetAssignment(): void {
    this.assignmentAccountId.set('');
    this.assignmentPlanCode.set('');
    this.assignmentBillingPeriod.set('monthly');
    this.assignmentMessage.set('');
    this.assignmentApplyImmediately.set(false);
    this.assignmentError.set('');
  }
}
