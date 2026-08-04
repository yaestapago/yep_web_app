import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideCheckCircle2,
  LucideCreditCard,
  LucideLoaderCircle,
  LucideRefreshCw,
} from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type {
  SubscriptionPlanSummary,
  SubscriptionUsageMetric,
} from '../../../../shared/models/auth.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { SubscriptionsApiService } from '../../services/subscriptions-api.service';

@Component({
  selector: 'app-subscription-page',
  imports: [
    DatePipe,
    Alert,
    Button,
    LucideCheckCircle2,
    LucideCreditCard,
    LucideLoaderCircle,
    LucideRefreshCw,
  ],
  templateUrl: './subscription.page.html',
  styleUrl: './subscription.page.scss',
})
export class SubscriptionPage implements OnInit {
  private readonly subscriptionsApi = inject(SubscriptionsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly subscription = signal(this.session.subscription());
  readonly usage = signal<SubscriptionUsageMetric[]>([]);
  readonly availablePlans = signal<SubscriptionPlanSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  readonly currentPlanName = computed(() => this.subscription()?.plan.name ?? 'Sin plan');
  readonly currentPlanCode = computed(() => this.subscription()?.plan.code ?? '');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.subscriptionsApi
      .overview()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.subscription.set(response.subscription);
          this.usage.set(response.usage);
          this.availablePlans.set(response.availablePlans);
          this.session.updateSubscription(response.subscription);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  requestPlan(plan: SubscriptionPlanSummary): void {
    this.success.set(
      `Solicitud preparada para ${plan.name}. En el siguiente paso conectaremos la aprobacion del superadmin.`,
    );
  }

  isCurrentPlan(plan: SubscriptionPlanSummary): boolean {
    return plan.code === this.currentPlanCode();
  }

  boundedPercent(metric: SubscriptionUsageMetric): number {
    return Math.max(0, Math.min(metric.percent, 100));
  }

  usageLabel(metric: SubscriptionUsageMetric): string {
    if (metric.limit === -1) {
      return `${this.formatNumber(metric.used)} usados`;
    }

    return `${this.formatNumber(metric.used)} de ${this.formatNumber(metric.limit)}`;
  }

  formatPlanLimit(value: number): string {
    if (value === -1) {
      return 'A medida';
    }
    if (value === 0) {
      return 'No incluido';
    }
    return this.formatNumber(value);
  }

  priceLabel(plan: SubscriptionPlanSummary): string {
    if (plan.isCustom) {
      return 'A medida';
    }
    return `${this.formatNumber(plan.priceCop)} ${plan.currency}`;
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('es-CO').format(value);
  }
}
