import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowRight,
  LucideCreditCard,
  LucideDynamicIcon,
  type LucideIcon,
  LucideLayoutDashboard,
  LucideMessageCircle,
  LucideSmartphone,
  LucideUsers,
} from '@lucide/angular';

import {
  canAccessBusinessSection,
  canAccessSubscription,
} from '../../../../core/constants/business-section-access';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { SUPPORT_WHATSAPP_URL } from '../../../../shared/constants/legal.constants';
import { Banner, ButtonLink, Card, IconTile, PageHeader, StatusChip } from '../../../../shared/ui';

/** Acción propia de una novedad: enlace externo que se abre en otra pestaña. */
interface NovedadAction {
  label: string;
  href: string;
  icon?: LucideIcon;
}

interface Novedad {
  category: string;
  title: string;
  description: string;
  /** En el banner es el botón primario; en "Más novedades", un enlace de texto. */
  action?: NovedadAction;
}

interface QuickLink {
  title: string;
  text: string;
  link: unknown[] | string;
  icon: LucideIcon;
  active: boolean;
}

/**
 * Recapitulación de las novedades de agosto (las de "Más novedades") en el blog del landing.
 * La nota de YEP Notifyer sigue en borrador: no se enlaza hasta que se publique.
 */
const NOVEDADES_POST_URL = 'https://yaestapago.co/blog/novedades-agosto-2026';

/** Línea de WhatsApp de YEP con un mensaje listo para enviar. */
function whatsappUrl(message: string): string {
  return `${SUPPORT_WHATSAPP_URL}?text=${encodeURIComponent(message)}`;
}

const TODAY_FORMAT = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

@Component({
  selector: 'app-home-page',
  imports: [
    RouterLink,
    LucideArrowRight,
    LucideDynamicIcon,
    LucideUsers,
    Banner,
    ButtonLink,
    Card,
    IconTile,
    PageHeader,
    StatusChip,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  private readonly session = inject(AuthSessionService);

  readonly user = this.session.user;
  readonly novedadesPostUrl = NOVEDADES_POST_URL;

  /** Fecha de hoy en texto largo ("Lunes, 12 de octubre") para el eyebrow del encabezado. */
  readonly today = computed(() => {
    const text = TODAY_FORMAT.format(new Date());
    return text.charAt(0).toUpperCase() + text.slice(1);
  });

  /**
   * Enlaces del home al negocio activo, con el mismo permiso que el ítem equivalente del menú
   * (`canAccessBusinessSection` / `canAccessSubscription`). Sin negocio activo apuntan a `/businesses`.
   */
  readonly shortcuts = computed(() => {
    const id = this.session.activeBusinessAccountId();
    const membership = this.session.activeMembership();
    const role = membership?.role;
    const isSu = this.session.isSuperUser();
    const sectionAccess = membership?.sectionAccess;
    const link = (path: string): unknown[] => (id ? ['/businesses', id, path] : ['/businesses']);
    const can = (section: Parameters<typeof canAccessBusinessSection>[0]) =>
      canAccessBusinessSection(section, role, isSu, sectionAccess);

    const quickLinks: QuickLink[] = [];
    if (can('dashboard')) {
      quickLinks.push({
        title: 'Panel de control',
        text: 'Pagos de hoy, en vivo.',
        link: link('dashboard'),
        icon: LucideLayoutDashboard,
        active: true,
      });
    }
    if (can('notification-routing')) {
      quickLinks.push({
        title: 'Alertas WhatsApp',
        text: 'Quién recibe cada aviso.',
        link: link('notification-routing'),
        icon: LucideMessageCircle,
        active: false,
      });
    }
    if (can('notifiers')) {
      quickLinks.push({
        title: 'Notificadores',
        text: 'Celulares y correos conectados.',
        link: link('notifiers'),
        icon: LucideSmartphone,
        active: false,
      });
    }
    if (canAccessSubscription(role, isSu)) {
      quickLinks.push({
        title: 'Suscripción',
        text: 'Tu plan y lo que te queda.',
        link: '/subscription',
        icon: LucideCreditCard,
        active: false,
      });
    }

    return {
      employees: can('employees') ? link('employees') : null,
      quickLinks,
    };
  });

  readonly novedades: Novedad[] = [
    {
      category: 'Notificadores',
      title: 'YEP Notifyer estrena imagen',
      description:
        'La app Android que le pasa a YEP los avisos de tu banco ahora se ve como tu panel, en modo claro y oscuro, y su aviso para celulares Xiaomi ya responde. Funciona igual: si ya la tienes, no tienes que volver a emparejarla.',
      action: {
        label: 'Pídela por WhatsApp',
        href: whatsappUrl(
          'Hola YEP, quiero el notificador YEP Notifyer para el celular de mi negocio',
        ),
        icon: LucideMessageCircle,
      },
    },
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

  /** Primera novedad: va en el banner. */
  readonly featured = this.novedades[0];
  /** Las demás: lista de "Más novedades". */
  readonly moreNovedades = this.novedades.slice(1);
}
