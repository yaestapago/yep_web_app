import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { PercentPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideLoaderCircle } from '@lucide/angular';

import { StatusDot } from '../../../../shared/ui/status-dot/status-dot';
import type { Notifier } from '../../../../shared/models/notifier.models';
import {
  NOTIFIER_STATUS_THRESHOLDS,
  computeNotifierStatus,
  type NotifierStatusLevel,
} from '../../../../shared/utils/notifier-status';
import { NotifiersApiService } from '../../../notifiers/services/notifiers-api.service';

@Component({
  selector: 'app-business-dashboard-section',
  imports: [PercentPipe, StatusDot, LucideLoaderCircle],
  templateUrl: './business-dashboard.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessDashboardSection implements OnInit {
  private readonly notifiersApi = inject(NotifiersApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly thresholds = inject(NOTIFIER_STATUS_THRESHOLDS);

  private readonly notifiers = signal<Notifier[]>([]);
  readonly loading = signal(false);

  readonly counts = computed(() => {
    const base: Record<NotifierStatusLevel, number> = {
      online: 0,
      delayed: 0,
      offline: 0,
      unknown: 0,
    };
    for (const notifier of this.notifiers()) {
      base[computeNotifierStatus(notifier, this.thresholds).level] += 1;
    }
    return base;
  });

  readonly total = computed(() => this.notifiers().length);
  readonly activeCount = computed(() => this.notifiers().filter((n) => n.active).length);

  /** Porcentaje de disponibilidad: notificadores en línea sobre el total. */
  readonly availability = computed(() => {
    const total = this.total();
    return total === 0 ? 0 : this.counts().online / total;
  });

  /** Porcentaje de ancho para cada segmento de la barra. */
  percent(level: NotifierStatusLevel): number {
    const total = this.total();
    return total === 0 ? 0 : (this.counts()[level] / total) * 100;
  }

  ngOnInit(): void {
    this.loading.set(true);
    this.notifiersApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.notifiers.set(response.notifiers);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
