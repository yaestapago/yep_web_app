import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LucideFileScan, LucideMenu } from '@lucide/angular';
import { filter, startWith } from 'rxjs';

import { ReceiptCaptureModal } from '../../../features/extraction/components/receipt-capture-modal/receipt-capture-modal';
import { Sidebar } from '../sidebar/sidebar';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Sidebar, ReceiptCaptureModal, LucideFileScan, LucideMenu],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** Controla el drawer del sidebar en móvil. */
  readonly drawerOpen = signal(false);
  readonly receiptCaptureOpen = signal(false);

  /**
   * Modo inmersivo: la ruta activa pidió ocupar el viewport completo (vía
   * `data.immersive`), así que el contenido se vuelve a ancho completo y altura
   * fija para que la página no scrollee (el scroll vive dentro de la vista).
   */
  readonly immersive = signal(false);

  constructor() {
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

  openReceiptCapture(): void {
    this.receiptCaptureOpen.set(true);
  }

  closeReceiptCapture(): void {
    this.receiptCaptureOpen.set(false);
  }
}
