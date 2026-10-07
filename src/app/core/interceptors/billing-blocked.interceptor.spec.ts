import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import type { BusinessBillingBlockedError } from '../../shared/models/billing-status.models';
import { AuthSessionService } from '../services/auth-session.service';
import { BillingStatusService } from '../services/billing-status.service';
import { billingBlockedInterceptor } from './billing-blocked.interceptor';

const API = 'http://api.test';

function blockedBody(overrides: Partial<BusinessBillingBlockedError> = {}): BusinessBillingBlockedError {
  return {
    statusCode: 402,
    code: 'BUSINESS_BILLING_BLOCKED',
    message: 'Negocio bloqueado',
    reason: 'payment_overdue',
    blockedAt: '2026-10-01T05:00:00.000Z',
    businessAccountId: 'b1',
    subscriptionUrl: '/subscription',
    ...overrides,
  };
}

describe('billingBlockedInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  const markBlocked = vi.fn();
  const navigateByUrl = vi.fn(() => Promise.resolve(true));
  const router = { url: '/businesses/b1/dashboard', navigateByUrl };
  let isOps = false;
  let activeBusinessId: string | null = 'b1';

  beforeEach(() => {
    markBlocked.mockClear();
    navigateByUrl.mockClear();
    router.url = '/businesses/b1/dashboard';
    isOps = false;
    activeBusinessId = 'b1';

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([billingBlockedInterceptor])),
        provideHttpClientTesting(),
        { provide: BillingStatusService, useValue: { markBlocked } },
        {
          provide: AuthSessionService,
          useValue: {
            activeBusinessAccountId: () => activeBusinessId,
            isInternalOpsUser: () => isOps,
          },
        },
        { provide: Router, useValue: router },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    httpMock.verify();
    // Deja que la redirección pendiente se resuelva antes del siguiente test.
    await Promise.resolve();
    await Promise.resolve();
  });

  function requestAndFail(url: string, status: number, body: object): unknown {
    let received: unknown = null;
    http.get(url).subscribe({ error: (error) => (received = error) });
    httpMock.expectOne(url).flush(body, { status, statusText: 'Error' });
    return received;
  }

  it('marks the business as blocked, redirects to the blocked page and rethrows', () => {
    const body = blockedBody();
    const error = requestAndFail(`${API}/dashboard/summary`, 402, body);

    expect(markBlocked).toHaveBeenCalledWith(body);
    expect(navigateByUrl).toHaveBeenCalledWith('/businesses/b1/blocked');
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(402);
  });

  it('redirects only once for simultaneous blocked responses', () => {
    http.get(`${API}/dashboard/summary`).subscribe({ error: () => undefined });
    http.get(`${API}/source-events`).subscribe({ error: () => undefined });

    httpMock
      .expectOne(`${API}/dashboard/summary`)
      .flush(blockedBody(), { status: 402, statusText: 'Payment Required' });
    httpMock
      .expectOne(`${API}/source-events`)
      .flush(blockedBody(), { status: 402, statusText: 'Payment Required' });

    expect(markBlocked).toHaveBeenCalledTimes(2);
    expect(navigateByUrl).toHaveBeenCalledTimes(1);
  });

  it('does not navigate when already on the blocked page (no loops)', () => {
    router.url = '/businesses/b1/blocked?from=dashboard';
    requestAndFail(`${API}/transactions`, 402, blockedBody());

    expect(markBlocked).toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('does not redirect internal ops users', () => {
    isOps = true;
    requestAndFail(`${API}/insights/duplicates`, 402, blockedBody());

    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('does not redirect for a late response of another business', () => {
    activeBusinessId = 'b2';
    requestAndFail(`${API}/transactions`, 402, blockedBody({ businessAccountId: 'b1' }));

    expect(markBlocked).toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('passes other errors through untouched', () => {
    const serverError = requestAndFail(`${API}/transactions`, 500, { message: 'boom' });
    const otherPaymentRequired = requestAndFail(`${API}/transactions`, 402, {
      code: 'SOMETHING_ELSE',
    });

    expect((serverError as HttpErrorResponse).status).toBe(500);
    expect((otherPaymentRequired as HttpErrorResponse).status).toBe(402);
    expect(markBlocked).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('lets successful responses through', () => {
    let body: unknown = null;
    http.get(`${API}/dashboard/summary`).subscribe((value) => (body = value));
    httpMock.expectOne(`${API}/dashboard/summary`).flush({ ok: true });

    expect(body).toEqual({ ok: true });
    expect(markBlocked).not.toHaveBeenCalled();
  });
});
