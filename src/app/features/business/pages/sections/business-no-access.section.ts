import { Component } from '@angular/core';
import { LucideShieldOff } from '@lucide/angular';

import { State } from '../../../../shared/ui/state/state';

@Component({
  selector: 'app-business-no-access-section',
  standalone: true,
  imports: [LucideShieldOff, State],
  template: `
    <yep-state
      class="no-access-state"
      kind="empty"
      title="No tienes apartados habilitados"
      description="Contacta al propietario del negocio para solicitar acceso a un apartado de la aplicación."
    >
      <svg slot="icon" lucideShieldOff aria-hidden="true"></svg>
    </yep-state>
  `,
  styleUrls: ['./business-sections.scss', './business-no-access.section.scss'],
})
export class BusinessNoAccessSection {}
