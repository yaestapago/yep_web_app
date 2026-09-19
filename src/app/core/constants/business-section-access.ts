import { BusinessMembershipRole, type SectionAccess } from '../../shared/models/auth.models';

export type BusinessSectionKey =
  | 'dashboard'
  | 'business-data'
  | 'accounts'
  | 'notifiers'
  | 'requests'
  | 'employees'
  | 'locations'
  | 'schedules'
  | 'reports'
  | 'insights'
  | 'notification-routing';

export const BUSINESS_SECTION_ACCESS: Record<BusinessSectionKey, BusinessMembershipRole[]> = {
  dashboard: ['account_owner', 'account_staff'],
  'business-data': ['account_owner', 'account_staff'],
  accounts: ['account_owner'],
  notifiers: ['account_owner'],
  requests: ['account_owner'],
  employees: ['account_owner'],
  locations: ['account_owner'],
  schedules: ['account_owner'],
  reports: ['account_owner', 'account_staff'],
  insights: [],
  'notification-routing': ['account_owner'],
};

const CONFIGURABLE_SECTION_FIELDS: Partial<Record<BusinessSectionKey, keyof SectionAccess>> = {
  dashboard: 'dashboard',
  'business-data': 'businessData',
  reports: 'reports',
};

/** SU y owner siempre tienen acceso; para staff, campos legacy ausentes equivalen a true. */
export function canAccessBusinessSection(
  section: BusinessSectionKey,
  role: BusinessMembershipRole | null | undefined,
  isSu = false,
  sectionAccess?: SectionAccess,
): boolean {
  if (isSu) return true;
  if (!role || !BUSINESS_SECTION_ACCESS[section].includes(role)) return false;
  if (role !== 'account_staff') return true;
  const field = CONFIGURABLE_SECTION_FIELDS[section];
  return field ? sectionAccess?.[field] ?? true : true;
}

/** Sub-permiso de "Panel de control": ver el resumen operativo (KPIs/gráficas/estado). */
export function canViewDashboardSummary(
  role: BusinessMembershipRole | null | undefined,
  isSu = false,
  sectionAccess?: SectionAccess,
): boolean {
  if (isSu || role !== 'account_staff') return true;
  return sectionAccess?.dashboardSummary ?? true;
}

/** Sub-permiso de "Panel de control": ver la tabla de eventos de ingreso. */
export function canViewDashboardIncomeTable(
  role: BusinessMembershipRole | null | undefined,
  isSu = false,
  sectionAccess?: SectionAccess,
): boolean {
  if (isSu || role !== 'account_staff') return true;
  return sectionAccess?.dashboardIncomeTable ?? true;
}

export function canAccessSubscription(
  role: BusinessMembershipRole | null | undefined,
  isSu = false,
): boolean {
  return isSu || role === 'account_owner';
}

export function canManageBusinesses(
  role: BusinessMembershipRole | null | undefined,
  isSu = false,
): boolean {
  return isSu || role === 'account_owner';
}