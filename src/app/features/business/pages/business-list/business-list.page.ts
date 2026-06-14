import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideChevronRight, LucideMapPin, LucidePlus } from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { BusinessMembership } from '../../../../shared/models/auth.models';
import { CreateBusinessModal } from '../../components/create-business-modal/create-business-modal';

@Component({
  selector: 'app-business-list-page',
  imports: [RouterLink, CreateBusinessModal, LucideChevronRight, LucideMapPin, LucidePlus],
  templateUrl: './business-list.page.html',
  styleUrl: './business-list.page.scss',
})
export class BusinessListPage {
  private readonly session = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly memberships = this.session.approvedMemberships;
  readonly activeBusinessAccountId = this.session.activeBusinessAccountId;
  readonly hasBusinesses = computed(() => this.memberships().length > 0);
  readonly createOpen = signal(false);

  openCreate(): void {
    this.createOpen.set(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }

  onCreated(businessId: string): void {
    this.createOpen.set(false);
    void this.router.navigate(['/businesses', businessId, 'overview']);
  }

  businessName(membership: BusinessMembership): string {
    return membership.businessAccount?.name?.trim() || 'Negocio sin nombre';
  }

  businessLocation(membership: BusinessMembership): string {
    const account = membership.businessAccount;
    if (!account) {
      return '';
    }
    return [account.city, account.address].filter(Boolean).join(' · ');
  }

  roleLabel(membership: BusinessMembership): string {
    return membership.role === 'account_owner' ? 'Propietario' : 'Staff';
  }

  initials(membership: BusinessMembership): string {
    const name = this.businessName(membership).trim();
    return name.slice(0, 2).toUpperCase() || 'NN';
  }
}
