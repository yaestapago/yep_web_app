import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthSessionService } from '../../services/auth-session.service';
import { ThemeService } from '../../services/theme.service';
import { Sidebar } from './sidebar';

describe('Sidebar', () => {
  const navigate = vi.fn();
  const navigateByUrl = vi.fn();
  const setActiveBusinessAccountId = vi.fn();
  let currentUrl = '/home';

  const router = {
    get url() {
      return currentUrl;
    },
    navigate,
    navigateByUrl,
  };

  const session = {
    user: signal({ firstName: 'Ana', lastName: 'Ruiz', email: 'ana@example.com' }),
    approvedMemberships: signal([
      { businessAccountId: 'b1', businessAccount: { name: 'Café Uno' } },
      { businessAccountId: 'b2', businessAccount: { name: '' } },
    ]),
    activeMembership: signal({ businessAccountId: 'b1', businessAccount: { name: 'Café Uno' } }),
    activeBusinessAccountId: signal('b1'),
    setActiveBusinessAccountId,
    clearSession: vi.fn(),
  };

  const theme = { isDark: signal(false), toggleTheme: vi.fn() };

  function create(): Sidebar {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: AuthSessionService, useValue: session },
        { provide: ThemeService, useValue: theme },
      ],
    });
    // Probamos la lógica de la clase sin renderizar la plantilla (evita
    // instanciar RouterLink, que requiere ActivatedRoute).
    return TestBed.runInInjectionContext(() => new Sidebar());
  }

  beforeEach(() => {
    navigate.mockClear();
    navigateByUrl.mockClear();
    setActiveBusinessAccountId.mockClear();
    currentUrl = '/home';
  });

  it('starts with the "Negocio" group open and toggles it', () => {
    const sidebar = create();
    expect(sidebar.businessGroupOpen()).toBe(true);
    sidebar.toggleBusinessGroup();
    expect(sidebar.businessGroupOpen()).toBe(false);
  });

  it('points "Panel de control" to the active business dashboard', () => {
    const sidebar = create();
    expect(sidebar.dashboardLink()).toEqual(['/businesses', 'b1', 'dashboard']);
  });

  it('builds business section links from the active business id', () => {
    const sidebar = create();
    expect(sidebar.businessLink('accounts')).toEqual(['/businesses', 'b1', 'accounts']);
  });

  it('exposes the business sections without the old overview', () => {
    const sidebar = create();
    expect(sidebar.businessSections.map((item) => item.path)).toEqual([
      'business-data',
      'accounts',
      'notifiers',
      'requests',
      'employees',
      'locations',
      'schedules',
    ]);
  });

  it('never shows an id as a business name fallback', () => {
    const sidebar = create();
    expect(sidebar.activeBusinessName()).toBe('Café Uno');
    // El negocio "b2" no tiene nombre: debe usar el texto neutro, nunca el id.
    expect(sidebar.businessName('b2')).toBe('Negocio sin nombre');
  });

  it('keeps the current section when switching business from a contextual view', () => {
    currentUrl = '/businesses/b1/accounts';
    const sidebar = create();

    sidebar.switchBusiness({ target: { value: 'b2' } } as unknown as Event);

    expect(setActiveBusinessAccountId).toHaveBeenCalledWith('b2');
    expect(navigate).toHaveBeenCalledWith(['/businesses', 'b2', 'accounts']);
  });

  it('only changes the active business (no navigation) from a non-contextual view', () => {
    currentUrl = '/home';
    const sidebar = create();

    sidebar.switchBusiness({ target: { value: 'b2' } } as unknown as Event);

    expect(setActiveBusinessAccountId).toHaveBeenCalledWith('b2');
    expect(navigate).not.toHaveBeenCalled();
  });
});
