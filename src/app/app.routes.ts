import { inject } from '@angular/core';
import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { businessManagementGuard } from './core/guards/business-management.guard';
import { businessGuard } from './core/guards/business.guard';
import { businessContextGuard } from './core/guards/business-context.guard';
import { businessSectionGuard } from './core/guards/business-section.guard';
import { superAdminGuard } from './core/guards/super-admin.guard';
import { subscriptionGuard } from './core/guards/subscription.guard';
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
    // Vista de superadmin (path obscuro, NO enlazado en el sidebar): CRUD del
    // catálogo global de reglas de notificadores. Fuera del Shell porque un
    // superadmin puede no tener negocio activo. La seguridad real la impone el
    // AccountSuGuard del backend; el path solo evita descubrimiento casual.
    path: '__ops/notifier-rules',
    canActivate: [authGuard, superAdminGuard],
    loadComponent: () =>
      import('./features/banks/pages/bank-admin/bank-admin.page').then(
        (m) => m.BankAdminPage,
      ),
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
        canActivate: [businessManagementGuard],
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
            data: { section: 'notifiers' },
            canActivate: [businessSectionGuard],
            loadComponent: () =>
              import('./features/business/pages/sections/business-notifiers.section').then(
                (m) => m.BusinessNotifiersSection,
              ),
          },
          {
            path: 'accounts',
            data: { section: 'accounts' },
            canActivate: [businessSectionGuard],
            loadComponent: () =>
              import('./features/business/pages/sections/business-accounts.section').then(
                (m) => m.BusinessAccountsSection,
              ),
          },
          {
            path: 'requests',
            data: { section: 'requests' },
            canActivate: [businessSectionGuard],
            loadComponent: () =>
              import('./features/business/pages/sections/business-requests.section').then(
                (m) => m.BusinessRequestsSection,
              ),
          },
          {
            path: 'locations',
            data: { section: 'locations' },
            canActivate: [businessSectionGuard],
            loadComponent: () =>
              import('./features/business/pages/sections/business-locations.section').then(
                (m) => m.BusinessLocationsSection,
              ),
          },
          {
            path: 'employees',
            data: { section: 'employees' },
            canActivate: [businessSectionGuard],
            loadComponent: () =>
              import('./features/business/pages/sections/business-employees.section').then(
                (m) => m.BusinessEmployeesSection,
              ),
          },
          {
            path: 'schedules',
            data: { section: 'schedules' },
            canActivate: [businessSectionGuard],
            loadComponent: () =>
              import('./features/business/pages/sections/business-schedules.section').then(
                (m) => m.BusinessSchedulesSection,
              ),
          },
          {
            path: 'reports',
            data: { section: 'reports' },
            canActivate: [businessSectionGuard],
            loadComponent: () =>
              import('./features/business/pages/sections/business-reports.section').then(
                (m) => m.BusinessReportsSection,
              ),
          },
          {
            path: 'business-data',
            data: { section: 'business-data' },
            canActivate: [businessSectionGuard],
            loadComponent: () =>
              import('./features/business/pages/sections/business-data.section').then(
                (m) => m.BusinessDataSection,
              ),
          },
          {
            path: 'notification-routing',
            data: { section: 'notification-routing' },
            canActivate: [businessSectionGuard],
            loadComponent: () =>
              import('./features/business/pages/sections/business-notification-routing.section').then(
                (m) => m.BusinessNotificationRoutingSection,
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
      {
        path: 'subscription',
        canActivate: [subscriptionGuard],
        loadComponent: () =>
          import('./features/subscription/pages/subscription/subscription.page').then(
            (m) => m.SubscriptionPage,
          ),
      },

      // Redirects de rutas en español (compatibilidad con enlaces previos).
      { path: 'negocios', pathMatch: 'full', redirectTo: 'businesses' },
      {
        path: 'negocios/:businessId',
        redirectTo: (route) => `/businesses/${route.params['businessId']}/business-data`,
      },
      { path: 'configuracion', pathMatch: 'full', redirectTo: 'settings' },
      { path: 'suscripcion', pathMatch: 'full', redirectTo: 'subscription' },
    ],
  },
  {
    path: '**',
    redirectTo: 'businesses',
  },
];
