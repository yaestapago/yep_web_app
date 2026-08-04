import {
  Component,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideBuilding2,
  LucideChevronDown,
  LucideCreditCard,
  LucideHouse,
  LucideLayoutDashboard,
  LucideLogOut,
  LucideMoon,
  LucidePanelLeftClose,
  LucidePanelLeftOpen,
  LucideSettings,
  LucideSun,
} from '@lucide/angular';

import { AuthSessionService } from '../../services/auth-session.service';
import { ThemeService } from '../../services/theme.service';
import { Select, type SelectOption } from '../../../shared/ui/select/select';
import {
  canAccessBusinessSection,
  type BusinessSectionKey,
} from '../../constants/business-section-access';

interface BusinessNavItem {
  path: BusinessSectionKey;
  label: string;
}

const ALL_BUSINESS_SECTIONS: BusinessNavItem[] = [
  { path: 'business-data', label: 'Datos del negocio' },
  { path: 'accounts', label: 'Cuentas bancarias' },
  { path: 'notifiers', label: 'Notificadores' },
  { path: 'requests', label: 'Solicitudes' },
  { path: 'employees', label: 'Empleados' },
  { path: 'locations', label: 'Sedes' },
  { path: 'schedules', label: 'Horarios' },
  { path: 'notification-routing', label: 'Alertas WhatsApp' },
  { path: 'reports', label: 'Informes' },
];

@Component({
  selector: 'app-sidebar',
  imports: [
    FormsModule,
    RouterLink,
    RouterLinkActive,
    Select,
    LucideBuilding2,
    LucideChevronDown,
    LucideCreditCard,
    LucideHouse,
    LucideLayoutDashboard,
    LucideLogOut,
    LucideMoon,
    LucidePanelLeftClose,
    LucidePanelLeftOpen,
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

  /** Rail colapsado (solo íconos) vs. sidebar completo; controlado por el shell. */
  readonly collapsed = input(false);

  /** Emitido al navegar o cerrar sesión para que el shell cierre el drawer en móvil. */
  readonly navigated = output<void>();

  /** Solicita cerrar sesión; el shell muestra la confirmación y ejecuta el cierre. */
  readonly logoutRequested = output<void>();

  /** Pide al shell alternar el ancho del sidebar (rail colapsable). */
  readonly collapseToggled = output<void>();

  readonly user = this.session.user;
  readonly isDark = this.theme.isDark;
  readonly memberships = this.session.approvedMemberships;
  readonly activeMembership = this.session.activeMembership;
  readonly activeBusinessAccountId = this.session.activeBusinessAccountId;
  readonly businessOptions = computed<SelectOption[]>(() =>
    this.memberships().map((membership) => ({
      id: membership.businessAccountId,
      label: this.businessName(membership.businessAccountId),
    })),
  );

  /** Grupo "Negocio" expandible; inicia abierto para dar contexto. */
  readonly businessGroupOpen = signal(true);
  readonly footerMenuOpen = signal(false);

  /**
   * Subsecciones del negocio activo, filtradas según el rol de la
   * membership activa (cuentas staff ven un subconjunto: ver
   * business-section-access.ts, que espeja lo que ya exige el backend).
   */
  readonly businessSections = computed<BusinessNavItem[]>(() => {
    const role = this.activeMembership()?.role;
    const isSu = this.session.isSuperUser();
    return ALL_BUSINESS_SECTIONS.filter((section) =>
      canAccessBusinessSection(section.path, role, isSu),
    );
  });

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

  toggleFooterMenu(): void {
    this.footerMenuOpen.update((open) => !open);
  }

  closeFooterMenu(): void {
    this.footerMenuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  closeFooterMenuFromOutside(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('.sidebar-actions')) {
      this.closeFooterMenu();
    }
  }

  @HostListener('document:keydown.escape')
  closeFooterMenuFromEscape(): void {
    this.closeFooterMenu();
  }

  /**
   * Cambia el negocio activo desde el selector (única fuente visual de cambio).
   * Si el usuario está en una vista contextual del negocio, conserva la misma
   * sección y solo cambia el negocio.
   */
  switchBusiness(event: Event): void {
    const businessAccountId = (event.target as HTMLSelectElement).value;
    this.switchBusinessId(businessAccountId);
  }

  switchBusinessId(value: string | number | null): void {
    const businessAccountId = typeof value === 'string' ? value : String(value ?? '');
    if (!businessAccountId) {
      return;
    }

    this.session.setActiveBusinessAccountId(businessAccountId);
    this.closeFooterMenu();
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
    this.closeFooterMenu();
    this.navigated.emit();
  }

  toggleCollapse(): void {
    this.collapseToggled.emit();
  }

  collapseLabel(): string {
    return this.collapsed() ? 'Expandir menú' : 'Colapsar menú';
  }

  toggleTheme(): void {
    this.theme.toggleTheme();
    this.closeFooterMenu();
  }

  themeLabel(): string {
    return this.isDark() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  }

  /** Pide al shell que confirme y ejecute el cierre de sesión. */
  requestLogout(): void {
    this.closeFooterMenu();
    this.logoutRequested.emit();
  }
}
