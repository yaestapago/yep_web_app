import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthSessionService } from '../services/auth-session.service';

/**
 * Garantiza que la ruta `/businesses/:businessId/...` corresponda a un negocio
 * al que el usuario tiene acceso aprobado y fija ese negocio como activo.
 *
 * Al fijar el negocio activo, el interceptor envía el header
 * `x-business-account-id` correcto y todos los datos quedan scopeados a ese
 * negocio, preservando el contexto incluso en enlaces directos o al refrescar.
 */
export const businessContextGuard: CanActivateFn = (route) => {
  const session = inject(AuthSessionService);
  const router = inject(Router);

  if (!session.isAuthenticated()) {
    return router.parseUrl('/login');
  }

  const businessId = route.paramMap.get('businessId');

  if (!businessId) {
    return router.parseUrl('/businesses');
  }

  const hasAccess = session
    .approvedMemberships()
    .some((membership) => membership.businessAccountId === businessId);

  if (!hasAccess) {
    return router.parseUrl('/businesses');
  }

  session.setActiveBusinessAccountId(businessId);
  return true;
};
