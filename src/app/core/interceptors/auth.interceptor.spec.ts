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
