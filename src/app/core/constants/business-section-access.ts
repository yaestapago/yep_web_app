import { BusinessMembershipRole } from '../../shared/models/auth.models';

/**
 * Espeja la política de autorización que ya aplica el backend (ver
 * `assertOwnerOrSu` / `@BusinessRoles` en accounts.controller.ts y
 * reports.controller.ts). No hay paquete compartido entre frontend y
 * backend en este monorepo, así que este mapa debe mantenerse sincronizado
 * a mano si cambia la política de un lado.
 */
export type BusinessSectionKey =
  | 'business-data'
  | 'accounts'
  | 'notifiers'
  | 'requests'
  | 'employees'
  | 'locations'
  | 'schedules'
  | 'reports'
  | 'notification-routing';

export const BUSINESS_SECTION_ACCESS: Record<BusinessSectionKey, BusinessMembershipRole[]> = {
  'business-data': ['account_owner', 'account_staff'], // staff: solo lectura
  accounts: ['account_owner'],
  notifiers: ['account_owner', 'account_staff'],
  requests: ['account_owner'],
  employees: ['account_owner'],
  locations: ['account_owner'],
  schedules: ['account_owner', 'account_staff'],
  reports: ['account_owner', 'account_staff'],
  'notification-routing': ['account_owner', 'account_staff'],
};

/** El SU siempre tiene acceso, sin importar la sección. */
export function canAccessBusinessSection(
  section: BusinessSectionKey,
  role: BusinessMembershipRole | null | undefined,
  isSu = false,
): boolean {
  if (isSu) {
    return true;
  }
  if (!role) {
    return false;
  }
  return BUSINESS_SECTION_ACCESS[section].includes(role);
}
