import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeService } from './core/services/theme.service';
import { NotificationModal } from './shared/ui/notification-modal/notification-modal';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NotificationModal],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /** Aplica el tema guardado desde el arranque, en cualquier ruta (también /register y /forgot-password). */
  private readonly theme = inject(ThemeService);
}
