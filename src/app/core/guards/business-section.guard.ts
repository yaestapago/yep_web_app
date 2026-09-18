import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthSessionService } from '../services/auth-session.service';
import {
  canAccessBusinessSection,
  type BusinessSectionKey,
} from '../constants/business-section-access';

/**
 * Cierra el hueco que dejaría solo ocultar el ítem del sidebar: sin este
 * guard, una cuenta staff podría entrar por URL directa a una sección que no
 * le corresponde (ej. `/businesses/:id/accounts`) aunque no la vea en el
 * menú. Cada child route bajo `businesses/:businessId` que restrinja acceso
 * debe declarar `data: { section: '<key>' }` (ver business-section-access.ts).
 */
export const businessSectionGuard: CanActivateFn = (route) => {
  const session = inject(AuthSessionService);
  const router = inject(Router);

  const section = route.data['section'] as BusinessSectionKey | undefined;
  if (!section) {
    return true;
  }

  const membership = session.activeMembership();
  const role = membership?.role;
  const isSu = session.isSuperUser();

  if (canAccessBusinessSection(section, role, isSu, membership?.sectionAccess)) {
    return true;
  }

  const businessId = session.activeBusinessAccountId();
  if (!businessId) return router.parseUrl('/businesses');

  const fallback = (['dashboard', 'business-data', 'reports'] as const).find((candidate) =>
    canAccessBusinessSection(candidate, role, isSu, membership?.sectionAccess),
  );
  return router.parseUrl(`/businesses/${businessId}/${fallback ?? 'no-access'}`);
};
