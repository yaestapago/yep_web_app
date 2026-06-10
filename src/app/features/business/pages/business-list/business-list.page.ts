import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronRight, LucideMapPin, LucidePlus } from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { BusinessMembership } from '../../../../shared/models/auth.models';

@Component({
  selector: 'app-business-list-page',
  imports: [RouterLink, LucideChevronRight, LucideMapPin, LucidePlus],
  templateUrl: './business-list.page.html',
  styleUrl: './business-list.page.scss',
})
export class BusinessListPage {
  private readonly session = inject(AuthSessionService);

  readonly memberships = this.session.approvedMemberships;
  readonly activeBusinessAccountId = this.session.activeBusinessAccountId;
  readonly hasBusinesses = computed(() => this.memberships().length > 0);

  businessName(membership: BusinessMembership): string {
    return membership.businessAccount?.name ?? membership.businessAccountId;
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
