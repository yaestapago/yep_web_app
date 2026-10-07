import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { LucideArrowLeft, LucideClock, LucideTriangleAlert } from '@lucide/angular';
import { filter, startWith } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { BillingStatusService } from '../../../../core/services/billing-status.service';
import { formatDaysLeft, formatLongDate } from '../../../../shared/utils/billing-format';

interface BillingBanner {
  tone: 'warning' | 'info';
  text: string;
  cta: { label: string; link: string } | null;
}

@Component({
  selector: 'app-business-shell-page',
  imports: [RouterLink, RouterOutlet, LucideArrowLeft, LucideClock, LucideTriangleAlert],
  templateUrl: './business-shell.page.html',
  styleUrl: './business-shell.page.scss',
})
export class BusinessShellPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly billing = inject(BillingStatusService);

  readonly businessId = signal<string | null>(null);

  readonly immersive = signal(false);

  readonly membership = computed(() => {
    const id = this.businessId();
    return this.session.approvedMemberships().find((item) => item.businessAccountId === id) ?? null;
  });

  /**
   * Aviso compacto de cobro, solo para propietarios: servicio por vencer o
   * pago en revisión. El estado "bloqueado" tiene su propia pantalla.
   */
  readonly billingBanner = computed<BillingBanner | null>(() => {
    const status = this.billing.status();
    if (!status || status.businessAccountId !== this.businessId() || !this.billing.isOwner()) {
      return null;
    }

    if (status.state === 'due_soon') {
      const date = formatLongDate(status.deadline);
      const when = date ? `vence el ${date}` : 'vence pronto';
      const days = status.daysLeft !== null ? ` (${formatDaysLeft(status.daysLeft)})` : '';
      return {
        tone: 'warning',
        text: `El servicio de ${this.businessName()} ${when}${days}. Realiza el pago para evitar el bloqueo.`,
        cta:
          status.phase === 'paid'
            ? { label: 'Ver cuentas de cobro', link: '/invoices' }
            : { label: 'Elegir un plan', link: '/subscription' },
      };
    }

    if (status.state === 'payment_review') {
      return {
        tone: 'info',
        text: 'Estamos revisando tu pago. Tu servicio sigue activo mientras lo confirmamos.',
        cta: null,
      };
    }

    return null;
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.businessId.set(params.get('businessId'));
    });

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(null),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        let active: ActivatedRoute | null = this.route.firstChild;
        while (active?.firstChild) {
          active = active.firstChild;
        }
        this.immersive.set(active?.snapshot.data['immersive'] === true);
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
    return [account.cityName, account.departmentName, account.address].filter(Boolean).join(' · ');
  }

  roleLabel(): string {
    return this.membership()?.role === 'account_owner' ? 'Propietario' : 'Staff';
  }

  initials(): string {
    return this.businessName().slice(0, 2).toUpperCase() || 'NN';
  }
}
