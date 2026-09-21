import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { canAccessInvoices } from '../constants/business-section-access';
import { AuthSessionService } from '../services/auth-session.service';

export const invoicesGuard: CanActivateFn = () => {
  const session = inject(AuthSessionService);
  const router = inject(Router);

  if (!session.isAuthenticated()) {
    return router.parseUrl('/login');
  }

  const role = session.activeMembership()?.role;
  if (canAccessInvoices(role, session.isSuperUser())) {
    return true;
  }

  const businessId = session.activeBusinessAccountId();
  return router.parseUrl(businessId ? `/businesses/${businessId}/dashboard` : '/businesses');
};
