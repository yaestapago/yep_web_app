import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { LucideChevronRight, LucideMapPin, LucidePlus, LucideUserPlus } from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type {
  BusinessMembership,
  SubscriptionCreationPermissionResponse,
} from '../../../../shared/models/auth.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { SubscriptionsApiService } from '../../../subscription/services/subscriptions-api.service';
import { CreateBusinessModal } from '../../components/create-business-modal/create-business-modal';
import { RequestMembershipModal } from '../../components/request-membership-modal/request-membership-modal';

@Component({
  selector: 'app-business-list-page',
  imports: [
    RouterLink,
    Alert,
    Button,
    CreateBusinessModal,
    RequestMembershipModal,
    LucideChevronRight,
    LucideMapPin,
    LucidePlus,
    LucideUserPlus,
  ],
  templateUrl: './business-list.page.html',
  styleUrl: './business-list.page.scss',
})
export class BusinessListPage implements OnInit {
  private readonly session = inject(AuthSessionService);
  private readonly subscriptionsApi = inject(SubscriptionsApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly memberships = this.session.approvedMemberships;
  readonly activeBusinessAccountId = this.session.activeBusinessAccountId;
  readonly hasBusinesses = computed(() => this.memberships().length > 0);
  readonly createOpen = signal(false);
  readonly requestOpen = signal(false);
  readonly checkingBusinessCreation = signal(false);
  readonly businessCreationPermission = signal<SubscriptionCreationPermissionResponse | null>(null);
  readonly planAlert = signal('');

  readonly canCreateBusiness = computed(
    () => this.businessCreationPermission()?.allowed !== false,
  );

  ngOnInit(): void {
    this.refreshBusinessCreationPermission();
  }

  openCreate(): void {
    this.checkBusinessCreationPermission(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }

  onCreated(businessId: string): void {
    this.createOpen.set(false);
    this.refreshBusinessCreationPermission();
    void this.router.navigate(['/businesses', businessId, 'business-data']);
  }

  openRequest(): void {
    this.requestOpen.set(true);
  }

  closeRequest(): void {
    this.requestOpen.set(false);
  }

  businessName(membership: BusinessMembership): string {
    return membership.businessAccount?.name?.trim() || 'Negocio sin nombre';
  }

  businessLocation(membership: BusinessMembership): string {
    const account = membership.businessAccount;
    if (!account) {
      return '';
    }
    return [account.cityName, account.departmentName, account.address].filter(Boolean).join(' · ');
  }

  roleLabel(membership: BusinessMembership): string {
    return membership.role === 'account_owner' ? 'Propietario' : 'Staff';
  }

  initials(membership: BusinessMembership): string {
    const name = this.businessName(membership).trim();
    return name.slice(0, 2).toUpperCase() || 'NN';
  }

  private refreshBusinessCreationPermission(): void {
    this.checkBusinessCreationPermission(false);
  }

  private checkBusinessCreationPermission(openWhenAllowed: boolean): void {
    if (this.checkingBusinessCreation()) {
      return;
    }

    this.checkingBusinessCreation.set(true);
    this.planAlert.set('');

    this.subscriptionsApi
      .canCreate('businesses')
      .pipe(
        finalize(() => this.checkingBusinessCreation.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (permission) => {
          this.businessCreationPermission.set(permission);

          if (permission.allowed) {
            if (openWhenAllowed) {
              this.createOpen.set(true);
            }
            return;
          }

          this.planAlert.set(this.businessLimitMessage(permission.planName));
        },
        error: (error) => this.planAlert.set(httpErrorMessage(error)),
      });
  }

  private businessLimitMessage(planName: string): string {
    return `Con tu plan actual (${planName}) no puedes agregar mas negocios.`;
  }
}
