import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideLoaderCircle, LucideRefreshCw } from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { Button } from '../../../../shared/ui/button/button';
import type { BusinessMembership } from '../../../../shared/models/auth.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

@Component({
  selector: 'app-business-requests-section',
  imports: [Button, LucideLoaderCircle, LucideRefreshCw],
  templateUrl: './business-requests.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessRequestsSection implements OnInit {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly businessId = this.session.activeBusinessAccountId;
  readonly requests = signal<BusinessMembership[]>([]);
  readonly loading = signal(false);
  readonly actingId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly message = signal('');
  readonly backendPending = signal(false);

  readonly canManage = computed(
    () =>
      this.session.activeMembership()?.role === 'account_owner' ||
      this.session.user()?.globalRole === 'account_su',
  );

  ngOnInit(): void {
    if (this.canManage()) {
      this.load();
    }
  }

  load(): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.message.set('');

    this.businessApi
      .listPendingStaffRequests(businessId)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.backendPending.set(false);
          this.requests.set(
            response.memberships.filter(
              (membership) =>
                membership.role === 'account_staff' && membership.status === 'pending',
            ),
          );
        },
        error: (error) => this.handleError(error),
      });
  }

  approve(membership: BusinessMembership): void {
    this.updateStatus(membership, 'approved');
  }

  reject(membership: BusinessMembership): void {
    if (!confirm('¿Rechazar esta solicitud de acceso?')) {
      return;
    }
    this.updateStatus(membership, 'rejected');
  }

  requesterLabel(membership: BusinessMembership): string {
    return (
      membership.email ??
      membership.identificationNumber ??
      membership.userId ??
      'Solicitante sin datos'
    );
  }

  private updateStatus(membership: BusinessMembership, status: 'approved' | 'rejected'): void {
    this.actingId.set(membership.id);
    this.error.set('');
    this.success.set('');

    this.businessApi
      .updateMembershipStatus(membership.businessAccountId, membership.id, { status })
      .pipe(
        finalize(() => this.actingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.requests.update((items) =>
            items.filter((current) => current.id !== response.membership.id),
          );
          this.success.set(status === 'approved' ? 'Solicitud aprobada.' : 'Solicitud rechazada.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  private handleError(error: unknown): void {
    this.requests.set([]);

    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.backendPending.set(true);
      this.message.set(
        'La bandeja de solicitudes aún no está disponible en el backend (endpoint pendiente).',
      );
      return;
    }

    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.message.set('No tienes permisos para ver estas solicitudes.');
      return;
    }

    this.message.set(httpErrorMessage(error));
  }
}
