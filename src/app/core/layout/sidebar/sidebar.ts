import { Component, computed, inject, output, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideBuilding2,
  LucideChevronDown,
  LucideChevronsUpDown,
  LucideHouse,
  LucideLayoutDashboard,
  LucideLogOut,
  LucideMoon,
  LucideSettings,
  LucideSun,
} from '@lucide/angular';

import { AuthSessionService } from '../../services/auth-session.service';
import { ThemeService } from '../../services/theme.service';

interface BusinessNavItem {
  path: string;
  label: string;
}

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    LucideBuilding2,
    LucideChevronDown,
    LucideChevronsUpDown,
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

  /** Solicita cerrar sesión; el shell muestra la confirmación y ejecuta el cierre. */
  readonly logoutRequested = output<void>();

  readonly user = this.session.user;
  readonly isDark = this.theme.isDark;
  readonly memberships = this.session.approvedMemberships;
  readonly activeMembership = this.session.activeMembership;
  readonly activeBusinessAccountId = this.session.activeBusinessAccountId;

  /** Grupo "Negocio" expandible; inicia abierto para dar contexto. */
  readonly businessGroupOpen = signal(true);

  /** Subsecciones del negocio activo (dependen del negocio seleccionado). */
  readonly businessSections: BusinessNavItem[] = [
    { path: 'business-data', label: 'Datos del negocio' },
    { path: 'accounts', label: 'Cuentas bancarias' },
    { path: 'notifiers', label: 'Notificadores' },
    { path: 'requests', label: 'Solicitudes' },
    { path: 'locations', label: 'Sedes' },
  ];

  /** Enlace al Panel de control del negocio activo (ruta canónica). */
  readonly dashboardLink = computed(() => {
    const id = this.activeBusinessAccountId();
    return id ? ['/businesses', id, 'dashboard'] : ['/businesses'];
  });

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

  /** Nombre del negocio activo; nunca expone IDs. */
  activeBusinessName(): string {
    const membership = this.activeMembership();
    if (!membership) {
      return 'Selecciona un negocio';
    }
    return membership.businessAccount?.name?.trim() || 'Negocio sin nombre';
  }

  /** Nombre de un negocio por id; nunca muestra el id como fallback. */
  businessName(businessAccountId: string): string {
    const account = this.memberships().find(
      (m) => m.businessAccountId === businessAccountId,
    )?.businessAccount;
    return account?.name?.trim() || 'Negocio sin nombre';
  }

  /** Enlace a una subsección del negocio activo. */
  businessLink(path: string): unknown[] {
    const id = this.activeBusinessAccountId();
    return id ? ['/businesses', id, path] : ['/businesses'];
  }

  toggleBusinessGroup(): void {
    this.businessGroupOpen.update((open) => !open);
  }

  /**
   * Cambia el negocio activo desde el selector (única fuente visual de cambio).
   * Si el usuario está en una vista contextual del negocio, conserva la misma
   * sección y solo cambia el negocio.
   */
  switchBusiness(event: Event): void {
    const businessAccountId = (event.target as HTMLSelectElement).value;
    if (!businessAccountId) {
      return;
    }

    this.session.setActiveBusinessAccountId(businessAccountId);
    this.navigated.emit();

    const path = this.router.url.split('?')[0];
    const match = path.match(/^\/businesses\/[^/]+\/(.+)$/);

    if (match) {
      // Conserva la sección contextual, solo cambia el negocio.
      void this.router.navigate(['/businesses', businessAccountId, ...match[1].split('/')]);
    } else if (path.startsWith('/businesses/')) {
      // Estaba en el negocio sin subruta: lleva al Panel de control.
      void this.router.navigate(['/businesses', businessAccountId, 'dashboard']);
    }
    // En vistas no contextuales (Novedades, Configuración, listado) solo cambia
    // el negocio activo sin navegar.
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

  /** Pide al shell que confirme y ejecute el cierre de sesión. */
  requestLogout(): void {
    this.logoutRequested.emit();
  }
}
