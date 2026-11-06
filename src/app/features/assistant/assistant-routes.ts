import {
  canAccessBusinessSection,
  canAccessInvoices,
  canAccessSubscription,
  canManageBusinesses,
} from '../../core/constants/business-section-access';
import type { BusinessMembershipRole, SectionAccess } from '../../shared/models/auth.models';
import type { AssistantPageKey } from './assistant-page';

export interface AssistantRouteAccess {
  businessId: string | null;
  role: BusinessMembershipRole | null | undefined;
  isSu: boolean;
  sectionAccess?: SectionAccess;
}

/**
 * Enlace de Router a una pantalla, con los mismos permisos del menú lateral. `null` si esta
 * persona no puede entrar: el nombre se queda como texto en vez de ser un enlace roto.
 */
export function assistantRouteFor(
  page: AssistantPageKey,
  access: AssistantRouteAccess,
): readonly string[] | null {
  const { businessId, role, isSu, sectionAccess } = access;
  switch (page) {
    case 'home':
      return ['/home'];
    case 'settings':
      return ['/settings'];
    case 'subscription':
      return canAccessSubscription(role, isSu) ? ['/subscription'] : null;
    case 'invoices':
      return canAccessInvoices(role, isSu) ? ['/invoices'] : null;
    case 'businesses':
      return canManageBusinesses(role, isSu) ? ['/businesses'] : null;
    case 'blocked':
      return businessId ? ['/businesses', businessId, 'blocked'] : null;
    default:
      return businessId && canAccessBusinessSection(page, role, isSu, sectionAccess)
        ? ['/businesses', businessId, page]
        : null;
  }
}
