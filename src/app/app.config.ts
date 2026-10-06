import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { authErrorInterceptor } from './core/interceptors/auth-error.interceptor';
import { billingBlockedInterceptor } from './core/interceptors/billing-blocked.interceptor';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthSessionService } from './core/services/auth-session.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([authInterceptor, authErrorInterceptor, billingBlockedInterceptor]),
    ),
    provideAppInitializer(() => inject(AuthSessionService).restoreSession()),
  ],
};
