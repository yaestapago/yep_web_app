import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthSessionService } from '../services/auth-session.service';
import { businessManagementGuard } from './business-management.guard';

describe('businessManagementGuard', () => {
  const parseUrl = vi.fn((url: string) => url);
  const router = { parseUrl };

  function runGuard() {
    return TestBed.runInInjectionContext(() =>
      businessManagementGuard({} as never, {} as never),
    );
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    parseUrl.mockClear();
  });

  function configure(session: Record<string, unknown>) {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthSessionService, useValue: session },
        { provide: Router, useValue: router },
      ],
    });
  }

  it('redirects unauthenticated users to login', () => {
    configure({ isAuthenticated: () => false });
    expect(runGuard()).toBe('/login');
    expect(parseUrl).toHaveBeenCalledWith('/login');
  });

  it('allows owners of the active business', () => {
    configure({
      isAuthenticated: () => true,
      isSuperUser: () => false,
      activeMembership: () => ({ role: 'account_owner' }),
    });
    expect(runGuard()).toBe(true);
  });

  it('redirects staff to the active business dashboard', () => {
    configure({
      isAuthenticated: () => true,
      isSuperUser: () => false,
      activeMembership: () => ({ role: 'account_staff' }),
      activeBusinessAccountId: () => 'b1',
    });
    expect(runGuard()).toBe('/businesses/b1/dashboard');
    expect(parseUrl).toHaveBeenCalledWith('/businesses/b1/dashboard');
  });

  it('allows superusers', () => {
    configure({
      isAuthenticated: () => true,
      isSuperUser: () => true,
      activeMembership: () => ({ role: 'account_staff' }),
    });
    expect(runGuard()).toBe(true);
  });
});
