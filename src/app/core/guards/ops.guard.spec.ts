import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthSessionService } from '../services/auth-session.service';
import { opsGuard } from './ops.guard';

describe('opsGuard', () => {
  const parseUrl = vi.fn((url: string) => url);

  function runGuard() {
    return TestBed.runInInjectionContext(() => opsGuard({} as never, {} as never));
  }

  function configure(isAuthenticated: boolean, isInternalOpsUser: boolean) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthSessionService,
          useValue: {
            isAuthenticated: () => isAuthenticated,
            isInternalOpsUser: () => isInternalOpsUser,
          },
        },
        { provide: Router, useValue: { parseUrl } },
      ],
    });
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    parseUrl.mockClear();
  });

  it('allows support and superadmin users', () => {
    configure(true, true);
    expect(runGuard()).toBe(true);
  });

  it('redirects regular authenticated users', () => {
    configure(true, false);
    expect(runGuard()).toBe('/businesses');
  });

  it('redirects unauthenticated users to login', () => {
    configure(false, false);
    expect(runGuard()).toBe('/login');
  });
});
