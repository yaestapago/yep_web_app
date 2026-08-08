import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AuthResponse } from '../../shared/models/auth.models';
import { AuthSessionService } from '../services/auth-session.service';
import { authInterceptor } from './auth.interceptor';

const authResponse: AuthResponse = {
  accessToken: 'token',
  user: {
    id: 'user-1',
    firstName: 'Pedro',
    lastName: 'Ramirez',
    email: 'pedro@example.com',
    identificationNumber: '123456789',
    cellphoneNumber: '3001234567',
  },
  memberships: [
    {
      id: 'membership-1',
      businessAccountId: 'business-1',
      role: 'account_owner',
      status: 'approved',
      locationIds: [],
    },
  ],
};

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let session: AuthSessionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSessionService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('adds authorization and active business headers to business-scoped requests', () => {
    session.saveSession(authResponse);

    http.get(`${environment.apiUrl}/notifications`).subscribe();
    const request = httpMock.expectOne(`${environment.apiUrl}/notifications`);

    expect(request.request.headers.get('Authorization')).toBe('Bearer token');
    expect(request.request.headers.get('x-business-account-id')).toBe('business-1');

    request.flush({ notifications: [] });
  });

  it('adds active business header to dashboard summary requests', () => {
    session.saveSession(authResponse);

    const url = `${environment.apiUrl}/dashboard/summary?from=2026-07-05T05:00:00.000Z&to=2026-07-06T04:59:59.999Z`;
    http.get(url).subscribe();
    const request = httpMock.expectOne(url);

    expect(request.request.headers.get('Authorization')).toBe('Bearer token');
    expect(request.request.headers.get('x-business-account-id')).toBe('business-1');

    request.flush({ range: {}, kpis: {}, charts: {}, semaphore: {}, alerts: [] });
  });

  it('adds active business header to insights requests', () => {
    session.saveSession(authResponse);

    const url = `${environment.apiUrl}/insights/reconciliation?from=2026-07-05T05:00:00.000Z&to=2026-08-04T04:59:59.999Z&direction=both`;
    http.get(url).subscribe();
    const request = httpMock.expectOne(url);

    expect(request.request.headers.get('Authorization')).toBe('Bearer token');
    expect(request.request.headers.get('x-business-account-id')).toBe('business-1');

    request.flush({ bankWithoutReceipt: [], receiptWithoutBank: [] });
  });

  it('does not add active business header to auth requests', () => {
    session.saveSession(authResponse);

    http
      .post(`${environment.apiUrl}/auth/login`, { email: 'pedro@example.com', password: 'secret123' })
      .subscribe();
    const request = httpMock.expectOne(`${environment.apiUrl}/auth/login`);

    expect(request.request.headers.get('Authorization')).toBe('Bearer token');
    expect(request.request.headers.has('x-business-account-id')).toBe(false);

    request.flush(authResponse);
  });
});
