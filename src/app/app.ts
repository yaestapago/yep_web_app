import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideLogOut, LucideMoon, LucideShieldCheck, LucideSun } from '@lucide/angular';

import { AuthSessionService } from './core/services/auth-session.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, LucideLogOut, LucideMoon, LucideShieldCheck, LucideSun],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  private readonly session = inject(AuthSessionService);
  private readonly theme = inject(ThemeService);

  readonly isAuthenticated = this.session.isAuthenticated;
  readonly isDark = this.theme.isDark;

  toggleTheme(): void {
    this.theme.toggleTheme();
  }

  themeLabel(): string {
    return this.isDark() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  }

  logout(): void {
    this.session.clearSession();
    void this.router.navigateByUrl('/login');
  }
}
