/**
 * Pantallas de la web que Zaira conoce. Copia de `backend/src/assistant/assistant-pages.ts`:
 * el cliente manda la clave, nunca una URL ni un texto, y el servidor pone la etiqueta que
 * ve el modelo. Fuera a propósito: `insights` (solo superadmin) y `__ops/*`.
 */
export const ASSISTANT_PAGE_LABELS = {
  home: 'Novedades',
  dashboard: 'Panel de control',
  'business-data': 'Datos del negocio',
  accounts: 'Cuentas bancarias',
  notifiers: 'Notificadores',
  requests: 'Solicitudes',
  employees: 'Empleados',
  locations: 'Sedes',
  schedules: 'Horarios',
  'notification-routing': 'Alertas WhatsApp',
  reports: 'Informes',
  blocked: 'Negocio bloqueado',
  subscription: 'Suscripción',
  invoices: 'Cuentas de cobro',
  settings: 'Configuración',
  businesses: 'Gestionar negocios',
} as const;

export type AssistantPageKey = keyof typeof ASSISTANT_PAGE_LABELS;

/** Pantallas que dependen del negocio activo (`/businesses/:id/<clave>`). */
const BUSINESS_PAGES: ReadonlySet<string> = new Set<AssistantPageKey>([
  'dashboard',
  'business-data',
  'accounts',
  'notifiers',
  'requests',
  'employees',
  'locations',
  'schedules',
  'notification-routing',
  'reports',
  'blocked',
]);

/** Pantallas de la cuenta, sin negocio en la URL. */
const ACCOUNT_PAGES: ReadonlySet<string> = new Set<AssistantPageKey>([
  'home',
  'subscription',
  'invoices',
  'settings',
  'businesses',
]);

export function isAssistantPageKey(value: unknown): value is AssistantPageKey {
  return typeof value === 'string' && Object.hasOwn(ASSISTANT_PAGE_LABELS, value);
}

/** Clave de la pantalla abierta; `undefined` si Zaira no la conoce (entonces no se manda nada). */
export function assistantPageFromUrl(url: string): AssistantPageKey | undefined {
  const path = url.split(/[?#]/)[0];

  const section = /^\/businesses\/[^/]+\/([^/]+)/.exec(path)?.[1];
  if (section) return BUSINESS_PAGES.has(section) ? (section as AssistantPageKey) : undefined;

  const page = /^\/([^/]+)\/?$/.exec(path)?.[1];
  return page && ACCOUNT_PAGES.has(page) ? (page as AssistantPageKey) : undefined;
}
