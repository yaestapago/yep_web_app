import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthSessionService } from '../services/auth-session.service';

/**
 * Mensajes que devuelve el guard JWT del backend cuando el token es inválido o
 * falta. Ante cualquiera de ellos cerramos sesión y volvemos al login.
 */
const INVALID_TOKEN_MESSAGES = [
  'Token de autenticación inválido',
  'Token de autenticación requerido',
];

/**
 * Intercepta respuestas 401 causadas por un token de sesión inválido o expirado
 * y redirige inmediatamente al login. Solo actúa cuando había una sesión activa,
 * de modo que no interfiere con 401 de lógica de negocio (p. ej. "Credenciales
 * inválidas" al iniciar sesión o "Contraseña actual inválida" al cambiarla).
 */
export const authErrorInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(AuthSessionService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        session.isAuthenticated() &&
        isInvalidTokenError(error)
      ) {
        session.clearSession();
        void router.navigate(['/login']);
      }

      return throwError(() => error);
    }),
  );
};

function isInvalidTokenError(error: HttpErrorResponse): boolean {
  const message = error.error?.message;
  return typeof message === 'string' && INVALID_TOKEN_MESSAGES.includes(message);
}
