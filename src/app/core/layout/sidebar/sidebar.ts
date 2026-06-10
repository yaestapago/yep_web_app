import { Component, inject, output, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideBuilding2,
  LucideChevronsUpDown,
  LucideHouse,
  LucideLayoutDashboard,
  LucideLogOut,
  LucideMoon,
  LucidePlus,
  LucideSettings,
  LucideSun,
} from '@lucide/angular';

import { AuthSessionService } from '../../services/auth-session.service';
import { ThemeService } from '../../services/theme.service';
import { CreateBusinessModal } from '../../../features/business/components/create-business-modal/create-business-modal';

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    CreateBusinessModal,
    LucideBuilding2,
    LucideChevronsUpDown,
    LucideHouse,
    LucideLayoutDashboard,
    LucideLogOut,
    LucideMoon,
    LucidePlus,
    LucideSettings,
    LucideSun,
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private readonly router = inject(Router);
  private readonly session = inject(AuthSessionService);
  private readonly theme = inject(ThemeService);

  /** Emitido al navegar o cerrar sesión para que el shell cierre el drawer en móvil. */
  readonly navigated = output<void>();

  readonly user = this.session.user;
  readonly isDark = this.theme.isDark;
  readonly memberships = this.session.approvedMemberships;
  readonly activeMembership = this.session.activeMembership;
  readonly activeBusinessAccountId = this.session.activeBusinessAccountId;

  readonly createOpen = signal(false);

  fullName(): string {
    const user = this.user();
    if (!user) {
      return '';
    }
    return `${user.firstName} ${user.lastName}`.trim();
  }

  initials(): string {
    const user = this.user();
    if (!user) {
      return '';
    }
    const first = user.firstName?.charAt(0) ?? '';
    const last = user.lastName?.charAt(0) ?? '';
    return (first + last).toUpperCase() || user.email.charAt(0).toUpperCase();
  }

  activeBusinessName(): string {
    const membership = this.activeMembership();
    return membership?.businessAccount?.name ?? 'Selecciona un negocio';
  }

  businessName(businessAccountId: string): string {
    return (
      this.memberships().find((m) => m.businessAccountId === businessAccountId)?.businessAccount
        ?.name ?? businessAccountId
    );
  }

  switchBusiness(event: Event): void {
    const businessAccountId = (event.target as HTMLSelectElement).value;
    if (!businessAccountId) {
      return;
    }
    this.session.setActiveBusinessAccountId(businessAccountId);
    this.navigated.emit();
    void this.router.navigate(['/businesses', businessAccountId, 'overview']);
  }

  openCreate(): void {
    this.createOpen.set(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }

  onCreated(businessId: string): void {
    this.createOpen.set(false);
    this.navigated.emit();
    void this.router.navigate(['/businesses', businessId, 'overview']);
  }

  onNavigate(): void {
    this.navigated.emit();
  }

  toggleTheme(): void {
    this.theme.toggleTheme();
  }

  themeLabel(): string {
    return this.isDark() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  }

  logout(): void {
    this.session.clearSession();
    this.navigated.emit();
    void this.router.navigateByUrl('/login');
  }
}
