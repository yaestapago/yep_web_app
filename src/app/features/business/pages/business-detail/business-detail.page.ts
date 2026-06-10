import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideBuilding2,
  LucideChartColumn,
  LucideCreditCard,
  LucidePlug,
  LucideSettings,
  LucideUsers,
} from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { BusinessMembership } from '../../../../shared/models/auth.models';

interface BusinessTab {
  id: string;
  label: string;
}

@Component({
  selector: 'app-business-detail-page',
  imports: [
    RouterLink,
    LucideArrowLeft,
    LucideBuilding2,
    LucideChartColumn,
    LucideCreditCard,
    LucidePlug,
    LucideSettings,
    LucideUsers,
  ],
  templateUrl: './business-detail.page.html',
  styleUrl: './business-detail.page.scss',
})
export class BusinessDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tabs: BusinessTab[] = [
    { id: 'info', label: 'Información' },
    { id: 'metrics', label: 'Métricas' },
    { id: 'users', label: 'Usuarios' },
    { id: 'integrations', label: 'Integraciones' },
    { id: 'accounts', label: 'Cuentas' },
    { id: 'settings', label: 'Configuración' },
  ];

  readonly businessAccountId = signal<string | null>(null);
  readonly activeTab = signal<string>('info');

  readonly membership = computed<BusinessMembership | null>(() => {
    const id = this.businessAccountId();
    return (
      this.session.approvedMemberships().find((item) => item.businessAccountId === id) ?? null
    );
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('businessAccountId');
      this.businessAccountId.set(id);
      this.activeTab.set('info');

      if (id && this.session.approvedMemberships().some((m) => m.businessAccountId === id)) {
        this.session.setActiveBusinessAccountId(id);
      }
    });
  }

  selectTab(tabId: string): void {
    this.activeTab.set(tabId);
  }

  businessName(): string {
    const membership = this.membership();
    return membership?.businessAccount?.name ?? membership?.businessAccountId ?? 'Negocio';
  }

  roleLabel(): string {
    return this.membership()?.role === 'account_owner' ? 'Propietario' : 'Staff';
  }

  initials(): string {
    return this.businessName().slice(0, 2).toUpperCase() || 'NN';
  }

  currentTabLabel(): string {
    return this.tabs.find((tab) => tab.id === this.activeTab())?.label ?? '';
  }
}
