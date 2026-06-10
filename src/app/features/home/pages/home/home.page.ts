import { Component, inject } from '@angular/core';
import { LucideHouse } from '@lucide/angular';

import { AuthSessionService } from '../../../../core/services/auth-session.service';

@Component({
  selector: 'app-home-page',
  imports: [LucideHouse],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  private readonly session = inject(AuthSessionService);

  readonly user = this.session.user;
}
