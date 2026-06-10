import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LucideMenu, LucideShieldCheck } from '@lucide/angular';

import { Sidebar } from '../sidebar/sidebar';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Sidebar, LucideMenu, LucideShieldCheck],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  /** Controla el drawer del sidebar en móvil. */
  readonly drawerOpen = signal(false);

  openDrawer(): void {
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }
}
