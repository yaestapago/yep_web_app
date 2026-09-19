import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideLoaderCircle, LucideRefreshCw } from '@lucide/angular';
import { finalize } from 'rxjs';

import type {
  PlanChangeRequestStatus,
  PlanChangeRequestSummary,
  PlanChangeRequestType,
} from '../../../../shared/models/billing.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
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
  imports: [DatePipe, FormsModule, Alert, Button, Input, Modal, LucideLoaderCircle, LucideRefreshCw],
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
    this.error.set('');

    this.api
      .list()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (requests) => this.requests.set(requests),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
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
        next: ({ request: updated }) => {
          this.updateRequestInList(updated);
          this.approvingRequest.set(null);
          this.success.set('Solicitud aprobada y factura generada.');
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
    this.requests.update((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
  }
}
