import { Component } from '@angular/core';

@Component({
  selector: 'app-business-no-access-section',
  standalone: true,
  template: `
    <section class="section-card" aria-labelledby="no-access-title">
      <div class="section-header">
        <div>
          <p class="eyebrow">Acceso restringido</p>
          <h2 id="no-access-title">No tienes apartados habilitados</h2>
          <p class="section-subtitle">
            Contacta al propietario del negocio para solicitar acceso a un apartado de la aplicación.
          </p>
        </div>
      </div>
    </section>
  `,
  styleUrl: './business-sections.scss',
})
export class BusinessNoAccessSection {}