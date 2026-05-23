import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthSessionService } from '../services/auth-session.service';

export const businessGuard: CanActivateFn = () => {
  const session = inject(AuthSessionService);
  const router = inject(Router);

  if (!session.isAuthenticated()) {
    return router.parseUrl('/login');
  }

  return session.ensureActiveBusiness() ? true : router.parseUrl('/onboarding');
};
