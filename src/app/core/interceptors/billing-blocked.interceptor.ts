import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { isBusinessBillingBlockedError } from '../../shared/models/billing-status.models';
import { AuthSessionService } from '../services/auth-session.service';
import { BillingStatusService } from '../services/billing-status.service';

/** Ruta de la pantalla de bloqueo de un negocio. */
export function businessBlockedUrl(businessAccountId: string): string {
  return `/businesses/${businessAccountId}/blocked`;
}

/** Redirección en curso, para no encadenar varias navegaciones por 402 simultáneos. */
let pendingRedirect: string | null = null;

/**
 * Traduce el 402 `BUSINESS_BILLING_BLOCKED` del backend: marca el negocio
 * como bloqueado en `BillingStatusService` y lleva a la pantalla de bloqueo.
 * El error se re-lanza siempre para que cada vista libere sus estados de carga.
 */
export const billingBlockedInterceptor: HttpInterceptorFn = (request, next) => {
  const billing = inject(BillingStatusService);
  const session = inject(AuthSessionService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 402 &&
        isBusinessBillingBlockedError(error.error)
      ) {
        const body = error.error;
        billing.markBlocked(body);

        const isActiveBusiness = body.businessAccountId === session.activeBusinessAccountId();
        if (isActiveBusiness && !session.isInternalOpsUser()) {
          redirectToBlockedPage(router, businessBlockedUrl(body.businessAccountId));
        }
      }

      return throwError(() => error);
    }),
  );
};

function redirectToBlockedPage(router: Router, target: string): void {
  const currentPath = router.url.split(/[?#]/)[0];
  if (currentPath === target || pendingRedirect === target) {
    return;
  }

  pendingRedirect = target;
  void router
    .navigateByUrl(target)
    .catch(() => false)
    .finally(() => {
      if (pendingRedirect === target) {
        pendingRedirect = null;
      }
    });
}
