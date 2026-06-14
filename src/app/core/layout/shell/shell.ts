import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LucideFileScan, LucideMenu } from '@lucide/angular';

import { ReceiptCaptureModal } from '../../../features/extraction/components/receipt-capture-modal/receipt-capture-modal';
import { Sidebar } from '../sidebar/sidebar';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Sidebar, ReceiptCaptureModal, LucideFileScan, LucideMenu],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  /** Controla el drawer del sidebar en móvil. */
  readonly drawerOpen = signal(false);
  readonly receiptCaptureOpen = signal(false);

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
