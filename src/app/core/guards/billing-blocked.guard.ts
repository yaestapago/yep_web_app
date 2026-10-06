import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { businessBlockedUrl } from '../interceptors/billing-blocked.interceptor';
import { AuthSessionService } from '../services/auth-session.service';
import { BillingStatusService } from '../services/billing-status.service';

/**
 * Protege las secciones con datos de pagos (panel, informes, conciliación…)
 * de un negocio bloqueado por cobro: redirige a `/businesses/:id/blocked`.
 *
 * Espera el estado de cobro si aún no se conoce para no mostrar la sección un
 * instante antes de redirigir. Si la consulta falla deja pasar: el 402 del
 * backend (y su interceptor) sigue siendo la barrera real.
 */
export const billingBlockedGuard: CanActivateFn = async (route) => {
  const session = inject(AuthSessionService);
  const billing = inject(BillingStatusService);
  const router = inject(Router);

  if (session.isInternalOpsUser()) {
    return true;
  }

  const businessId =
    route.parent?.paramMap.get('businessId') ?? session.activeBusinessAccountId();
  if (!businessId) {
    return true;
  }

  const status = await billing.ensureLoaded(businessId);
  return status?.state === 'blocked' ? router.parseUrl(businessBlockedUrl(businessId)) : true;
};
