import { Component, inject, output } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideBuilding2,
  LucideHouse,
  LucideLayoutDashboard,
  LucideLogOut,
  LucideMoon,
  LucideSettings,
  LucideSun,
} from '@lucide/angular';

import { AuthSessionService } from '../../services/auth-session.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    LucideBuilding2,
    LucideHouse,
    LucideLayoutDashboard,
    LucideLogOut,
    LucideMoon,
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
