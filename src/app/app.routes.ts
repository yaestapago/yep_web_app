import { inject } from '@angular/core';
import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { businessGuard } from './core/guards/business.guard';
import { businessContextGuard } from './core/guards/business-context.guard';
import { Shell } from './core/layout/shell/shell';
import { AuthSessionService } from './core/services/auth-session.service';

/**
 * `/dashboard` ahora es solo un alias compatible: redirige al Panel de control
 * del negocio activo (`/businesses/:businessId/dashboard`). Si no hay negocio
 * activo, lleva al listado de negocios.
 */
function redirectToActiveBusinessDashboard(): string {
  const session = inject(AuthSessionService);
  const businessId = session.activeBusinessAccountId();
  return businessId ? `/businesses/${businessId}/dashboard` : '/businesses';
}

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'businesses',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/pages/register/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/pages/forgot-password/forgot-password.page').then(
        (m) => m.ForgotPasswordPage,
      ),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/pages/reset-password/reset-password.page').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'onboarding',
    canActivate: [authGuard],
    loadComponent: () => import('./features/business/pages/onboarding/onboarding.page').then((m) => m.OnboardingPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [businessGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./features/home/pages/home/home.page').then((m) => m.HomePage),
      },
      {
        // Compatibilidad: redirige al Panel de control del negocio activo.
        path: 'dashboard',
        redirectTo: redirectToActiveBusinessDashboard,
      },
      {
        path: 'businesses',
        loadComponent: () =>
          import('./features/business/pages/business-list/business-list.page').then(
            (m) => m.BusinessListPage,
          ),
      },
      {
        path: 'businesses/:businessId',
        canActivate: [businessContextGuard],
        loadComponent: () =>
          import('./features/business/pages/business-shell/business-shell.page').then(
            (m) => m.BusinessShellPage,
          ),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'business-data' },
          { path: 'overview', pathMatch: 'full', redirectTo: 'business-data' },
          {
            path: 'dashboard',
            // `immersive`: el panel ocupa el viewport completo, así que la
            // cabecera del negocio se compacta (ver BusinessShellPage).
            data: { immersive: true },
            loadComponent: () =>
              import('./features/business/pages/sections/business-dashboard.section').then(
                (m) => m.BusinessDashboardSection,
              ),
          },
          {
            path: 'notifiers',
            loadComponent: () =>
              import('./features/business/pages/sections/business-notifiers.section').then(
                (m) => m.BusinessNotifiersSection,
              ),
          },
          {
            path: 'accounts',
            loadComponent: () =>
              import('./features/business/pages/sections/business-accounts.section').then(
                (m) => m.BusinessAccountsSection,
              ),
          },
          {
            path: 'requests',
            loadComponent: () =>
              import('./features/business/pages/sections/business-requests.section').then(
                (m) => m.BusinessRequestsSection,
              ),
          },
          {
            path: 'locations',
            loadComponent: () =>
              import('./features/business/pages/sections/business-locations.section').then(
                (m) => m.BusinessLocationsSection,
              ),
          },
          {
            path: 'schedules',
            loadComponent: () =>
              import('./features/business/pages/sections/business-schedules.section').then(
                (m) => m.BusinessSchedulesSection,
              ),
          },
          {
            path: 'business-data',
            loadComponent: () =>
              import('./features/business/pages/sections/business-data.section').then(
                (m) => m.BusinessDataSection,
              ),
          },
          // Compatibilidad: la antigua vista combinada de "Configuración" ahora
          // se divide en "Datos del negocio" y "Sedes".
          { path: 'settings', pathMatch: 'full', redirectTo: 'business-data' },
        ],
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/pages/settings/settings.page').then((m) => m.SettingsPage),
      },

      // Redirects de rutas en español (compatibilidad con enlaces previos).
      { path: 'negocios', pathMatch: 'full', redirectTo: 'businesses' },
      {
        path: 'negocios/:businessId',
        redirectTo: (route) => `/businesses/${route.params['businessId']}/business-data`,
      },
      { path: 'configuracion', pathMatch: 'full', redirectTo: 'settings' },
    ],
  },
  {
    path: '**',
    redirectTo: 'businesses',
  },
];
