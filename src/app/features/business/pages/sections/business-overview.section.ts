import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideBell, LucideCreditCard, LucideUserPlus } from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';

@Component({
  selector: 'app-business-overview-section',
  imports: [RouterLink, LucideBell, LucideCreditCard, LucideUserPlus],
  templateUrl: './business-overview.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessOverviewSection {
  private readonly session = inject(AuthSessionService);

  readonly account = computed(() => this.session.activeMembership()?.businessAccount ?? null);
  readonly businessName = computed(() => this.account()?.name?.trim() || 'Negocio sin nombre');
}
