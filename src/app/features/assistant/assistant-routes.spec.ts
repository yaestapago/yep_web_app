import type { SectionAccess } from '../../shared/models/auth.models';
import { type AssistantRouteAccess, assistantRouteFor } from './assistant-routes';

const owner: AssistantRouteAccess = { businessId: 'n1', role: 'account_owner', isSu: false };
const staff: AssistantRouteAccess = { businessId: 'n1', role: 'account_staff', isSu: false };

describe('assistantRouteFor', () => {
  it('el dueño llega a las secciones de su negocio y a su cuenta', () => {
    expect(assistantRouteFor('notifiers', owner)).toEqual(['/businesses', 'n1', 'notifiers']);
    expect(assistantRouteFor('subscription', owner)).toEqual(['/subscription']);
    expect(assistantRouteFor('invoices', owner)).toEqual(['/invoices']);
    expect(assistantRouteFor('businesses', owner)).toEqual(['/businesses']);
  });

  it('un empleado no recibe enlaces a lo que no ve en el menú', () => {
    for (const page of [
      'notifiers',
      'employees',
      'accounts',
      'subscription',
      'invoices',
    ] as const) {
      expect(assistantRouteFor(page, staff)).toBeNull();
    }
    expect(assistantRouteFor('settings', staff)).toEqual(['/settings']);
    expect(assistantRouteFor('dashboard', staff)).toEqual(['/businesses', 'n1', 'dashboard']);
  });

  it('respeta los apartados apagados de un empleado', () => {
    const sectionAccess = { dashboard: false, businessData: true, reports: true } as SectionAccess;
    expect(assistantRouteFor('dashboard', { ...staff, sectionAccess })).toBeNull();
    expect(assistantRouteFor('reports', { ...staff, sectionAccess })).toEqual([
      '/businesses',
      'n1',
      'reports',
    ]);
  });

  it('sin negocio activo no hay enlaces a secciones de negocio', () => {
    expect(assistantRouteFor('notifiers', { ...owner, businessId: null })).toBeNull();
    expect(assistantRouteFor('blocked', { ...owner, businessId: null })).toBeNull();
    expect(assistantRouteFor('home', { ...owner, businessId: null })).toEqual(['/home']);
  });

  it('el superadmin entra a todo', () => {
    const su: AssistantRouteAccess = { businessId: 'n1', role: null, isSu: true };
    expect(assistantRouteFor('employees', su)).toEqual(['/businesses', 'n1', 'employees']);
    expect(assistantRouteFor('invoices', su)).toEqual(['/invoices']);
  });
});
