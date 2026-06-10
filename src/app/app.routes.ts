import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { businessGuard } from './core/guards/business.guard';
import { Shell } from './core/layout/shell/shell';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home',
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
        path: 'negocios',
        loadComponent: () =>
          import('./features/business/pages/business-list/business-list.page').then(
            (m) => m.BusinessListPage,
          ),
      },
      {
        path: 'negocios/:businessAccountId',
        loadComponent: () =>
          import('./features/business/pages/business-detail/business-detail.page').then(
            (m) => m.BusinessDetailPage,
          ),
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./features/settings/pages/settings/settings.page').then((m) => m.SettingsPage),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
