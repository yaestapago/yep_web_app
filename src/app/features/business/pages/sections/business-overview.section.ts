import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LucideBell, LucideCreditCard, LucideUserPlus } from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { StatusDot } from '../../../../shared/ui/status-dot/status-dot';
import type { Notifier } from '../../../../shared/models/notifier.models';
import {
  NOTIFIER_STATUS_THRESHOLDS,
  computeNotifierStatus,
  type NotifierStatusLevel,
} from '../../../../shared/utils/notifier-status';
import { NotifiersApiService } from '../../../notifiers/services/notifiers-api.service';

@Component({
  selector: 'app-business-overview-section',
  imports: [RouterLink, StatusDot, LucideBell, LucideCreditCard, LucideUserPlus],
  templateUrl: './business-overview.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessOverviewSection implements OnInit {
  private readonly notifiersApi = inject(NotifiersApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly thresholds = inject(NOTIFIER_STATUS_THRESHOLDS);

  readonly account = computed(() => this.session.activeMembership()?.businessAccount ?? null);
  private readonly notifiers = signal<Notifier[]>([]);
  readonly loaded = signal(false);

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

  ngOnInit(): void {
    this.notifiersApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.notifiers.set(response.notifiers);
          this.loaded.set(true);
        },
        error: () => this.loaded.set(true),
      });
  }
}
