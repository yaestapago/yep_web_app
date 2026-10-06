import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideCircleCheck,
  LucideClock,
  LucideLoaderCircle,
  LucideLock,
} from '@lucide/angular';

import { canAccessBusinessSection } from '../../../../core/constants/business-section-access';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { BillingStatusService } from '../../../../core/services/billing-status.service';
import { Button } from '../../../../shared/ui/button/button';
import {
  blockReasonLabel,
  formatCopAmount,
  formatLongDate,
} from '../../../../shared/utils/billing-format';

/**
 * Pantalla de negocio bloqueado por cobro. Llegan aquí el guard de secciones
 * con datos de pagos y el interceptor del 402 `BUSINESS_BILLING_BLOCKED`.
 *
 * No redirige sola cuando el estado ya no es "bloqueado" (evita bucles si el
 * estado y el 402 del backend no coinciden por un instante): ofrece un botón.
 */
@Component({
  selector: 'app-business-blocked-section',
  imports: [Button, LucideCircleCheck, LucideClock, LucideLoaderCircle, LucideLock],
  templateUrl: './business-blocked.section.html',
  styleUrl: './business-blocked.section.scss',
})
export class BusinessBlockedSection implements OnInit {
  private readonly billing = inject(BillingStatusService);
  private readonly session = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly checking = signal(true);
  readonly status = this.billing.status;
  readonly isBlocked = this.billing.isBlocked;
  readonly isOwner = this.billing.isOwner;
  readonly state = this.billing.state;
  readonly invoice = this.billing.currentInvoice;

  readonly businessName = computed(
    () => this.session.activeMembership()?.businessAccount?.name?.trim() || 'Tu negocio',
  );
  readonly blockedSince = computed(() => formatLongDate(this.billing.blockedAt()));
  readonly reasonText = computed(() => blockReasonLabel(this.billing.reason()));
  readonly paysInvoice = computed(() => this.billing.reason() === 'payment_overdue');
  readonly nextStepText = computed(() => {
    if (this.paysInvoice()) {
      const invoice = this.invoice();
      return invoice
        ? `Paga la cuenta de cobro ${invoice.invoiceNumber} por ${formatCopAmount(invoice.totalCop)} y reporta el pago para reactivar el servicio.`
        : 'Paga la cuenta de cobro pendiente y reporta el pago para reactivar el servicio.';
    }
    return 'Elige un plan en Suscripción para reactivar el servicio.';
  });
  readonly canOpenDashboard = computed(() => {
    const membership = this.session.activeMembership();
    return canAccessBusinessSection(
      'dashboard',
      membership?.role,
      this.session.isSuperUser(),
      membership?.sectionAccess,
    );
  });

  ngOnInit(): void {
    this.check();
  }

  check(): void {
    this.checking.set(true);
    void this.billing.refresh().finally(() => this.checking.set(false));
  }

  goToSubscription(): void {
    void this.router.navigateByUrl('/subscription');
  }

  goToInvoices(): void {
    void this.router.navigateByUrl('/invoices');
  }

  goToDashboard(): void {
    const businessId = this.session.activeBusinessAccountId();
    void this.router.navigate(businessId ? ['/businesses', businessId, 'dashboard'] : ['/businesses']);
  }
}
