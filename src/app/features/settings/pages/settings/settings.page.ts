import { Component, inject } from '@angular/core';
import {
  LucideBell,
  LucideMail,
  LucideMonitorSmartphone,
  LucideMoon,
  LucidePalette,
  LucideShield,
  LucideSlidersHorizontal,
  LucideSun,
  LucideUser,
} from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-settings-page',
  imports: [
    LucideBell,
    LucideMail,
    LucideMonitorSmartphone,
    LucideMoon,
    LucidePalette,
    LucideShield,
    LucideSlidersHorizontal,
    LucideSun,
    LucideUser,
  ],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  private readonly session = inject(AuthSessionService);
  private readonly theme = inject(ThemeService);

  readonly user = this.session.user;
  readonly isDark = this.theme.isDark;

  fullName(): string {
    const user = this.user();
    if (!user) {
      return '';
    }
    return `${user.firstName} ${user.lastName}`.trim();
  }

  setLight(): void {
    if (this.isDark()) {
      this.theme.toggleTheme();
    }
  }

  setDark(): void {
    if (!this.isDark()) {
      this.theme.toggleTheme();
    }
  }
}
