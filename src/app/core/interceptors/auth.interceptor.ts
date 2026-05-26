import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AuthSessionService } from '../services/auth-session.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(AuthSessionService);
  const accessToken = session.accessToken();
  const activeBusinessAccountId = session.activeBusinessAccountId();

  if (!accessToken) {
    return next(request);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };

  if (activeBusinessAccountId && isBusinessScopedRequest(request.url)) {
    headers['x-business-account-id'] = activeBusinessAccountId;
  }

  return next(
    request.clone({
      setHeaders: headers,
    }),
  );
};

function isBusinessScopedRequest(url: string): boolean {
  return [
    '/business-accounts/active',
    '/business-accounts/',
    '/customers',
    '/notifications',
    '/payment-supports',
    '/source-events',
    '/transactions',
    '/whatsapp',
  ].some((path) => url.includes(path));
}
