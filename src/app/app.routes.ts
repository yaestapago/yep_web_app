import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { businessGuard } from './core/guards/business.guard';
import { businessContextGuard } from './core/guards/business-context.guard';
import { Shell } from './core/layout/shell/shell';

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
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/pages/dashboard/dashboard.page').then((m) => m.DashboardPage),
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
          { path: '', pathMatch: 'full', redirectTo: 'overview' },
          {
            path: 'overview',
            loadComponent: () =>
              import('./features/business/pages/sections/business-overview.section').then(
                (m) => m.BusinessOverviewSection,
              ),
          },
          {
            path: 'dashboard',
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
            path: 'settings',
            loadComponent: () =>
              import('./features/business/pages/sections/business-settings.section').then(
                (m) => m.BusinessSettingsSection,
              ),
          },
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
        redirectTo: (route) => `/businesses/${route.params['businessId']}/overview`,
      },
      { path: 'configuracion', pathMatch: 'full', redirectTo: 'settings' },
    ],
  },
  {
    path: '**',
    redirectTo: 'businesses',
  },
];
