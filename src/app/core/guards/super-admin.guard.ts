import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthSessionService } from '../services/auth-session.service';

/**
 * Restringe una ruta a super-usuarios (`globalRole === 'account_su'`). El
 * respaldo real de seguridad es el `AccountSuGuard` del backend; este guard solo
 * evita mostrar la vista en el cliente. Un no-autenticado va a `/login`; un
 * autenticado sin el rol va a `/businesses` (no revela la existencia de la vista).
 */
export const superAdminGuard: CanActivateFn = () => {
  const session = inject(AuthSessionService);
  const router = inject(Router);

  if (!session.isAuthenticated()) return router.parseUrl('/login');
  return session.isSuperUser() ? true : router.parseUrl('/businesses');
};
