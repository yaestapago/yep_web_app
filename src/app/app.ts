import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { NotificationModal } from './shared/ui/notification-modal/notification-modal';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NotificationModal],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
