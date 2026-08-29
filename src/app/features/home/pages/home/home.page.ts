import { Component, inject } from '@angular/core';

import { AuthSessionService } from '../../../../core/services/auth-session.service';

interface Novedad {
  category: string;
  title: string;
  description: string;
}

/** Recapitulación completa publicada en el blog del landing. */
const NOVEDADES_POST_URL = 'https://yaestapago.co/blog/novedades-agosto-2026';

@Component({
  selector: 'app-home-page',
  imports: [],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  private readonly session = inject(AuthSessionService);

  readonly user = this.session.user;
  readonly novedadesPostUrl = NOVEDADES_POST_URL;

  readonly novedades: Novedad[] = [
    {
      category: 'Panel de pagos',
      title: 'Un panel de pagos más claro',
      description:
        'Unificamos eventos y transacciones en un solo tablero. El detalle ahora muestra la foto del comprobante, el nivel de verificación y el aviso de duplicados en un mismo lugar.',
    },
    {
      category: 'Conciliación',
      title: 'Nueva sección de Conciliación',
      description:
        'Eventos de banco sin comprobante, comprobantes sin confirmar y duplicados, con acciones para resolver cada caso.',
    },
    {
      category: 'Equipo',
      title: 'Roles y permisos por negocio',
      description:
        'Dueño, administrador y colaborador ahora ven y pueden hacer cosas distintas. Invita a tu equipo por código, enlace o QR, y limita qué cuentas y llaves ve cada colaborador.',
    },
    {
      category: 'Suscripción',
      title: 'Tu plan, siempre a la vista',
      description:
        'Cada negocio ve su plan de suscripción y cuánto le queda disponible en cuentas, notificadores y demás límites.',
    },
    {
      category: 'Notificaciones',
      title: 'Pagos detectados con más precisión',
      description:
        'Reenvío de notificaciones por WhatsApp, soporte para la llave Bre-B de Bancolombia, mejor lectura de correos bancarios y fechas más claras en cada evento.',
    },
    {
      category: 'Seguridad',
      title: 'Tu cuenta, más segura',
      description:
        'La verificación de cuenta y la recuperación de contraseña ahora usan códigos de un solo uso enviados por correo.',
    },
  ];
}
