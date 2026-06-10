import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthSessionService } from '../services/auth-session.service';
import { businessContextGuard } from './business-context.guard';

describe('businessContextGuard', () => {
  const parseUrl = vi.fn((url: string) => url);
  const router = { parseUrl };
  const setActiveBusinessAccountId = vi.fn();

  function runGuard(businessId: string | null) {
    const route = { paramMap: { get: () => businessId } };
    return TestBed.runInInjectionContext(() =>
      businessContextGuard(route as never, {} as never),
    );
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    parseUrl.mockClear();
    setActiveBusinessAccountId.mockClear();
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
    expect(runGuard('business-1')).toBe('/login');
    expect(parseUrl).toHaveBeenCalledWith('/login');
  });

  it('redirects to the businesses list when the user lacks access', () => {
    configure({
      isAuthenticated: () => true,
      approvedMemberships: () => [{ businessAccountId: 'other' }],
      setActiveBusinessAccountId,
    });
    expect(runGuard('business-1')).toBe('/businesses');
    expect(setActiveBusinessAccountId).not.toHaveBeenCalled();
  });

  it('activates the business and allows access when the user is an approved member', () => {
    configure({
      isAuthenticated: () => true,
      approvedMemberships: () => [{ businessAccountId: 'business-1' }],
      setActiveBusinessAccountId,
    });
    expect(runGuard('business-1')).toBe(true);
    expect(setActiveBusinessAccountId).toHaveBeenCalledWith('business-1');
  });
});
