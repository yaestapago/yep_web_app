import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { routes } from '../../app.routes';
import { AuthSessionService } from '../services/auth-session.service';
import { superAdminGuard } from './super-admin.guard';

describe('superAdminGuard', () => {
  const parseUrl = vi.fn((url: string) => url);

  function runGuard() {
    return TestBed.runInInjectionContext(() => superAdminGuard({} as never, {} as never));
  }

  function configure(isAuthenticated: boolean, isSuperUser: boolean) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthSessionService,
          useValue: { isAuthenticated: () => isAuthenticated, isSuperUser: () => isSuperUser },
        },
        { provide: Router, useValue: { parseUrl } },
      ],
    });
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    parseUrl.mockClear();
  });

  it('deja pasar a un superadmin (account_su)', () => {
    configure(true, true);
    expect(runGuard()).toBe(true);
  });

  it('manda a un usuario sin el rol a /businesses, sin revelar la vista', () => {
    configure(true, false);
    expect(runGuard()).toBe('/businesses');
  });

  it('manda a un no autenticado a /login', () => {
    configure(false, false);
    expect(runGuard()).toBe('/login');
  });

  it('protege la ruta del banco de comprobantes igual que Gestión de bancos', () => {
    const shell = routes.find((route) =>
      route.children?.some((child) => child.path === '__ops/receipt-bank'),
    );
    const receiptBank = shell?.children?.find((child) => child.path === '__ops/receipt-bank');
    const banks = shell?.children?.find((child) => child.path === '__ops/notifier-rules');

    expect(receiptBank?.canActivate).toEqual([superAdminGuard]);
    expect(banks?.canActivate).toEqual(receiptBank?.canActivate);
  });
});
