import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthSessionService } from '../services/auth-session.service';
import { businessSectionGuard } from './business-section.guard';

describe('businessSectionGuard', () => {
  const parseUrl = vi.fn((url: string) => url);
  const router = { parseUrl };

  function runGuard(section: string) {
    return TestBed.runInInjectionContext(() =>
      businessSectionGuard({ data: { section } } as never, {} as never),
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

  it('redirects owners away from insights', () => {
    configure({
      isSuperUser: () => false,
      activeMembership: () => ({ role: 'account_owner' }),
      activeBusinessAccountId: () => 'b1',
    });

    expect(runGuard('insights')).toBe('/businesses/b1/dashboard');
    expect(parseUrl).toHaveBeenCalledWith('/businesses/b1/dashboard');
  });

  it('redirects staff away from insights', () => {
    configure({
      isSuperUser: () => false,
      activeMembership: () => ({ role: 'account_staff' }),
      activeBusinessAccountId: () => 'b1',
    });

    expect(runGuard('insights')).toBe('/businesses/b1/dashboard');
    expect(parseUrl).toHaveBeenCalledWith('/businesses/b1/dashboard');
  });

  it('allows superusers into insights', () => {
    configure({
      isSuperUser: () => true,
      activeMembership: () => ({ role: 'account_owner' }),
    });

    expect(runGuard('insights')).toBe(true);
  });

  it('redirects staff to the first enabled configurable section', () => {
    configure({
      isSuperUser: () => false,
      activeMembership: () => ({
        role: 'account_staff',
        sectionAccess: { dashboard: false, businessData: true, reports: true },
      }),
      activeBusinessAccountId: () => 'b1',
    });

    expect(runGuard('dashboard')).toBe('/businesses/b1/business-data');
  });

  it('redirects staff with every section disabled to no-access', () => {
    configure({
      isSuperUser: () => false,
      activeMembership: () => ({
        role: 'account_staff',
        sectionAccess: { dashboard: false, businessData: false, reports: false },
      }),
      activeBusinessAccountId: () => 'b1',
    });

    expect(runGuard('reports')).toBe('/businesses/b1/no-access');
  });});
