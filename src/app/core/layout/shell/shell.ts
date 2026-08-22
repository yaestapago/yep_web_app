import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LucideFileScan, LucideMenu } from '@lucide/angular';
import { filter, startWith } from 'rxjs';

import { AuthApiService } from '../../../features/auth/services/auth-api.service';
import { ReceiptCaptureModal } from '../../../features/extraction/components/receipt-capture-modal/receipt-capture-modal';
import { Button } from '../../../shared/ui/button/button';
import { Modal } from '../../../shared/ui/modal/modal';
import { AuthSessionService } from '../../services/auth-session.service';
import { Sidebar } from '../sidebar/sidebar';

const SIDEBAR_COLLAPSED_KEY = 'yep-sidebar-collapsed';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Sidebar, ReceiptCaptureModal, Modal, Button, LucideFileScan, LucideMenu],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(AuthSessionService);
  private readonly authApi = inject(AuthApiService);

  /** Controla el drawer del sidebar en móvil. */
  readonly drawerOpen = signal(false);
  readonly receiptCaptureOpen = signal(false);
  readonly canShowReceiptCaptureButton = computed(
    () => this.session.subscription()?.plan.code !== 'free_trial',
  );

  /** Rail colapsable en escritorio; se recuerda entre sesiones. */
  readonly sidebarCollapsed = signal(this.loadSidebarCollapsed());

  /** Controla el modal de confirmación de cierre de sesión. */
  readonly logoutModalOpen = signal(false);

  /**
   * Modo inmersivo: la ruta activa pidió ocupar el viewport completo (vía
   * `data.immersive`), así que el contenido se vuelve a ancho completo y altura
   * fija para que la página no scrollee (el scroll vive dentro de la vista).
   */
  readonly immersive = signal(false);

  constructor() {
    effect(() => {
      if (!this.canShowReceiptCaptureButton()) {
        this.receiptCaptureOpen.set(false);
      }
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

  openDrawer(): void {
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  /** Alterna el sidebar entre ancho completo y rail de solo íconos. */
  toggleSidebarCollapse(): void {
    const collapsed = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(collapsed);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // Almacenamiento no disponible (modo privado, cuota, etc.): no persiste, no rompe.
    }
  }

  private loadSidebarCollapsed(): boolean {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  openReceiptCapture(): void {
    if (!this.canShowReceiptCaptureButton()) {
      return;
    }

    this.receiptCaptureOpen.set(true);
  }

  closeReceiptCapture(): void {
    this.receiptCaptureOpen.set(false);
  }

  /** Abre la confirmación de cierre de sesión solicitada desde el sidebar. */
  openLogout(): void {
    this.logoutModalOpen.set(true);
  }

  /** Cierra el modal sin cerrar sesión. */
  cancelLogout(): void {
    this.logoutModalOpen.set(false);
  }

  /** Confirma y ejecuta el cierre de sesión. */
  confirmLogout(): void {
    this.logoutModalOpen.set(false);
    this.closeDrawer();
    this.authApi
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.finishLogout(),
        error: () => this.finishLogout(),
      });
  }

  private finishLogout(): void {
    this.session.clearSession();
    void this.router.navigateByUrl('/login');
  }
}
