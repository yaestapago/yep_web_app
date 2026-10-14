import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { AuthSessionService } from '../services/auth-session.service';

// Mensajes del JwtAuthGuard del backend (`auth/guards/jwt-auth.guard.ts`). Antes estaban
// guardados con doble codificación ("autenticaciÃ³n") y nunca coincidían: el token vencido no
// se renovaba.
const INVALID_TOKEN_MESSAGES = [
  'Token de autenticación inválido',
  'Token de autenticación requerido',
];

export const authErrorInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(AuthSessionService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        session.isAuthenticated() &&
        isInvalidTokenError(error) &&
        !isRefreshRequest(request.url)
      ) {
        // Renovación compartida (pestaña y Web Lock entre pestañas): ver AuthSessionService.
        return from(session.refreshAccessToken()).pipe(
          catchError(() => {
            session.clearSession();
            void router.navigate(['/login']);
            return throwError(() => error);
          }),
          switchMap((response) =>
            next(
              request.clone({
                setHeaders: {
                  Authorization: `Bearer ${response.accessToken}`,
                },
              }),
            ),
          ),
        );
      }

      return throwError(() => error);
    }),
  );
};

function isInvalidTokenError(error: HttpErrorResponse): boolean {
  const message = error.error?.message;
  return typeof message === 'string' && INVALID_TOKEN_MESSAGES.includes(message);
}

function isRefreshRequest(url: string): boolean {
  return url.includes('/auth/refresh');
}
