import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideArrowLeft,
  LucideBell,
  LucideCreditCard,
  LucideLayoutDashboard,
  LucideLayoutGrid,
  LucideSettings,
  LucideUserPlus,
} from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';

interface BusinessSection {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-business-shell-page',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    LucideArrowLeft,
    LucideBell,
    LucideCreditCard,
    LucideLayoutDashboard,
    LucideLayoutGrid,
    LucideSettings,
    LucideUserPlus,
  ],
  templateUrl: './business-shell.page.html',
  styleUrl: './business-shell.page.scss',
})
export class BusinessShellPage {
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly businessId = signal<string | null>(null);

  /** Secciones que organizan la vista de un negocio. */
  readonly sections: BusinessSection[] = [
    { path: 'overview', label: 'Resumen', icon: 'layoutGrid' },
    { path: 'dashboard', label: 'Dashboard', icon: 'layoutDashboard' },
    { path: 'notifiers', label: 'Notificadores', icon: 'bell' },
    { path: 'accounts', label: 'Cuentas', icon: 'creditCard' },
    { path: 'requests', label: 'Solicitudes', icon: 'userPlus' },
    { path: 'settings', label: 'Configuración', icon: 'settings' },
  ];

  readonly membership = computed(() => {
    const id = this.businessId();
    return this.session.approvedMemberships().find((item) => item.businessAccountId === id) ?? null;
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.businessId.set(params.get('businessId'));
    });
  }

  businessName(): string {
    const membership = this.membership();
    return membership?.businessAccount?.name ?? membership?.businessAccountId ?? 'Negocio';
  }

  businessLocation(): string {
    const account = this.membership()?.businessAccount;
    if (!account) {
      return '';
    }
    return [account.city, account.address].filter(Boolean).join(' · ');
  }

  roleLabel(): string {
    return this.membership()?.role === 'account_owner' ? 'Propietario' : 'Staff';
  }

  initials(): string {
    return this.businessName().slice(0, 2).toUpperCase() || 'NN';
  }
}
