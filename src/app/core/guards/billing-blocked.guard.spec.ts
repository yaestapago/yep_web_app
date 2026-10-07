import { TestBed } from '@angular/core/testing';
import { Router, convertToParamMap } from '@angular/router';

import type { BillingStatusResponse } from '../../shared/models/billing-status.models';
import { AuthSessionService } from '../services/auth-session.service';
import { BillingStatusService } from '../services/billing-status.service';
import { billingBlockedGuard } from './billing-blocked.guard';

function status(overrides: Partial<BillingStatusResponse> = {}): BillingStatusResponse {
  return {
    businessAccountId: 'b1',
    phase: 'paid',
    state: 'ok',
    reason: null,
    deadline: '2026-10-20T05:00:00.000Z',
    daysLeft: 15,
    blockedAt: null,
    isOwner: true,
    planName: 'Pro',
    currentInvoice: null,
    ...overrides,
  };
}

describe('billingBlockedGuard', () => {
  const parseUrl = vi.fn((url: string) => url);
  const ensureLoaded = vi.fn<(businessId: string) => Promise<BillingStatusResponse | null>>();

  function configure(session: { isOps?: boolean; activeBusinessId?: string | null } = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthSessionService,
          useValue: {
            isInternalOpsUser: () => session.isOps ?? false,
            activeBusinessAccountId: () =>
              session.activeBusinessId === undefined ? 'b1' : session.activeBusinessId,
          },
        },
        { provide: BillingStatusService, useValue: { ensureLoaded } },
        { provide: Router, useValue: { parseUrl } },
      ],
    });
  }

  function runGuard(parentBusinessId: string | null = 'b1') {
    const route = {
      parent: parentBusinessId
        ? { paramMap: convertToParamMap({ businessId: parentBusinessId }) }
        : null,
    };
    return TestBed.runInInjectionContext(() =>
      billingBlockedGuard(route as never, {} as never),
    ) as Promise<unknown>;
  }

  beforeEach(() => {
    parseUrl.mockClear();
    ensureLoaded.mockReset();
  });

  it('redirects a blocked business to its blocked page', async () => {
    configure();
    ensureLoaded.mockResolvedValue(status({ state: 'blocked', reason: 'trial_ended' }));

    await expect(runGuard()).resolves.toBe('/businesses/b1/blocked');
    expect(ensureLoaded).toHaveBeenCalledWith('b1');
    expect(parseUrl).toHaveBeenCalledWith('/businesses/b1/blocked');
  });

  it.each(['ok', 'due_soon', 'payment_review'] as const)(
    'allows access when the state is %s',
    async (state) => {
      configure();
      ensureLoaded.mockResolvedValue(status({ state }));

      await expect(runGuard()).resolves.toBe(true);
      expect(parseUrl).not.toHaveBeenCalled();
    },
  );

  it('fails open when the billing status cannot be loaded', async () => {
    configure();
    ensureLoaded.mockResolvedValue(null);

    await expect(runGuard()).resolves.toBe(true);
  });

  it('never blocks internal ops users', async () => {
    configure({ isOps: true });

    await expect(runGuard()).resolves.toBe(true);
    expect(ensureLoaded).not.toHaveBeenCalled();
  });

  it('uses the business from the parent route params', async () => {
    configure({ activeBusinessId: 'other' });
    ensureLoaded.mockResolvedValue(status({ businessAccountId: 'b9', state: 'blocked' }));

    await expect(runGuard('b9')).resolves.toBe('/businesses/b9/blocked');
    expect(ensureLoaded).toHaveBeenCalledWith('b9');
  });

  it('falls back to the active business and allows access without one', async () => {
    configure({ activeBusinessId: null });

    await expect(runGuard(null)).resolves.toBe(true);
    expect(ensureLoaded).not.toHaveBeenCalled();
  });
});
