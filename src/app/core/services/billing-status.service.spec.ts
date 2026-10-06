import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import type { AuthResponse } from '../../shared/models/auth.models';
import type { BillingStatusResponse } from '../../shared/models/billing-status.models';
import { AuthSessionService } from './auth-session.service';
import { BillingStatusService } from './billing-status.service';

const STATUS_URL = `${environment.apiUrl}/subscriptions/billing-status`;

function authResponse(globalRole?: 'account_su' | 'support'): AuthResponse {
  return {
    accessToken: 'token',
    user: {
      id: 'user-1',
      firstName: 'Ana',
      lastName: 'Ruiz',
      email: 'ana@example.com',
      identificationNumber: '123',
      cellphoneNumber: '3000000000',
      globalRole,
    },
    memberships: [
      {
        id: 'm1',
        businessAccountId: 'b1',
        role: 'account_owner',
        status: 'approved',
        locationIds: [],
      },
    ],
  };
}

function status(overrides: Partial<BillingStatusResponse> = {}): BillingStatusResponse {
  return {
    businessAccountId: 'b1',
    phase: 'paid',
    state: 'ok',
    reason: null,
    deadline: null,
    daysLeft: null,
    blockedAt: null,
    isOwner: true,
    planName: 'Pro',
    currentInvoice: null,
    ...overrides,
  };
}

describe('BillingStatusService', () => {
  let httpMock: HttpTestingController;
  let session: AuthSessionService;

  function setup(globalRole?: 'account_su' | 'support'): BillingStatusService {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSessionService);
    session.saveSession(authResponse(globalRole));
    const service = TestBed.inject(BillingStatusService);
    TestBed.tick();
    return service;
  }

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('loads the status of the active business with its header', async () => {
    const service = setup();

    const request = httpMock.expectOne(STATUS_URL);
    expect(request.request.headers.get('x-business-account-id')).toBe('b1');
    request.flush(status({ state: 'blocked', reason: 'trial_ended', phase: 'trial' }));
    await Promise.resolve();

    expect(service.isBlocked()).toBe(true);
    expect(service.reason()).toBe('trial_ended');
    expect(service.isOwner()).toBe(true);
  });

  it('never reports internal ops users as blocked', async () => {
    const service = setup('account_su');

    httpMock.expectOne(STATUS_URL).flush(status({ state: 'blocked' }));
    await Promise.resolve();

    expect(service.state()).toBe('blocked');
    expect(service.isBlocked()).toBe(false);
  });

  it('marks the active business as blocked from a 402 body', async () => {
    const service = setup();
    httpMock.expectOne(STATUS_URL).flush(status({ state: 'due_soon', daysLeft: 2 }));
    await Promise.resolve();

    service.markBlocked({
      statusCode: 402,
      code: 'BUSINESS_BILLING_BLOCKED',
      message: 'Bloqueado',
      reason: 'payment_overdue',
      blockedAt: '2026-10-01T05:00:00.000Z',
      businessAccountId: 'b1',
      subscriptionUrl: '/subscription',
    });

    expect(service.isBlocked()).toBe(true);
    expect(service.reason()).toBe('payment_overdue');
    expect(service.blockedAt()).toBe('2026-10-01T05:00:00.000Z');
    expect(service.daysLeft()).toBe(2);
  });

  it('ignores 402 bodies of a business that is no longer active', async () => {
    const service = setup();
    httpMock.expectOne(STATUS_URL).flush(status());
    await Promise.resolve();

    service.markBlocked({
      statusCode: 402,
      code: 'BUSINESS_BILLING_BLOCKED',
      message: 'Bloqueado',
      reason: 'payment_overdue',
      blockedAt: null,
      businessAccountId: 'other',
      subscriptionUrl: '/subscription',
    });

    expect(service.isBlocked()).toBe(false);
  });

  it('reuses the in-flight request in ensureLoaded and fails open on errors', async () => {
    const service = setup();

    const pending = service.ensureLoaded('b1');
    httpMock
      .expectOne(STATUS_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    await expect(pending).resolves.toBeNull();
    expect(service.isBlocked()).toBe(false);
    // Tras un fallo no reintenta en cada navegación.
    await expect(service.ensureLoaded('b1')).resolves.toBeNull();
    httpMock.expectNone(STATUS_URL);
  });
});
