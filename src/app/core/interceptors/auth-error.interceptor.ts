import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, shareReplay, switchMap, throwError } from 'rxjs';

import { AuthApiService } from '../../features/auth/services/auth-api.service';
import { AuthResponse } from '../../shared/models/auth.models';
import { AuthSessionService } from '../services/auth-session.service';

const INVALID_TOKEN_MESSAGES = [
  'Token de autenticaciÃ³n invÃ¡lido',
  'Token de autenticaciÃ³n requerido',
];

let refreshRequest$: Observable<AuthResponse> | null = null;

export const authErrorInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(AuthSessionService);
  const authApi = inject(AuthApiService);
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
        return getRefreshRequest(authApi).pipe(
          catchError(() => {
            session.clearSession();
            void router.navigate(['/login']);
            return throwError(() => error);
          }),
          switchMap((response) => {
            session.saveSession(response);
            return next(
              request.clone({
                setHeaders: {
                  Authorization: `Bearer ${response.accessToken}`,
                },
              }),
            );
          }),
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

function getRefreshRequest(authApi: AuthApiService): Observable<AuthResponse> {
  refreshRequest$ ??= authApi.refresh().pipe(
    finalize(() => {
      refreshRequest$ = null;
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  return refreshRequest$;
}
