import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthSessionService } from '../services/auth-session.service';
import { businessGuard } from './business.guard';

describe('businessGuard', () => {
  const parseUrl = vi.fn((url: string) => url);
  const router = { parseUrl };

  function runGuard() {
    return TestBed.runInInjectionContext(() => businessGuard({} as never, {} as never));
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    parseUrl.mockClear();
  });

  it('redirects unauthenticated users to login', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthSessionService, useValue: { isAuthenticated: () => false } },
        { provide: Router, useValue: router },
      ],
    });

    expect(runGuard()).toBe('/login');
    expect(parseUrl).toHaveBeenCalledWith('/login');
  });

  it('redirects authenticated users without an active approved business to onboarding', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthSessionService,
          useValue: { isAuthenticated: () => true, ensureActiveBusiness: () => false },
        },
        { provide: Router, useValue: router },
      ],
    });

    expect(runGuard()).toBe('/onboarding');
    expect(parseUrl).toHaveBeenCalledWith('/onboarding');
  });

  it('allows dashboard access when an approved business can be activated', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthSessionService,
          useValue: { isAuthenticated: () => true, ensureActiveBusiness: () => true },
        },
        { provide: Router, useValue: router },
      ],
    });

    expect(runGuard()).toBe(true);
  });
});
