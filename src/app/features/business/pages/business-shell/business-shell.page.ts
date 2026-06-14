import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';

@Component({
  selector: 'app-business-shell-page',
  imports: [RouterLink, RouterOutlet, LucideArrowLeft],
  templateUrl: './business-shell.page.html',
  styleUrl: './business-shell.page.scss',
})
export class BusinessShellPage {
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly businessId = signal<string | null>(null);

  // La navegación entre secciones del negocio vive ahora en el sidebar (grupo
  // "Negocio"), por lo que aquí ya no hay pestañas duplicadas.

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
    return this.membership()?.businessAccount?.name?.trim() || 'Negocio sin nombre';
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
