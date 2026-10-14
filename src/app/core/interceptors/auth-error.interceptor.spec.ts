import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthResponse } from '../../shared/models/auth.models';
import { AuthSessionService } from '../services/auth-session.service';
import { authErrorInterceptor } from './auth-error.interceptor';
import { authInterceptor } from './auth.interceptor';

const refreshUrl = `${environment.apiUrl}/auth/refresh`;

function authResponse(accessToken: string): AuthResponse {
  return {
    accessToken,
    user: {
      id: 'user-1',
      firstName: 'Pedro',
      lastName: 'Ramirez',
      email: 'pedro@example.com',
      identificationNumber: '123456789',
      cellphoneNumber: '3001234567',
    },
    memberships: [],
  };
}

const invalidToken = {
  status: 401,
  statusText: 'Unauthorized',
};

describe('authErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let session: AuthSessionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor, authErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSessionService);
    session.saveSession(authResponse('old-token'));
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('renueva el token vencido y repite la petición con el token nuevo', () => {
    let body: unknown;
    http.get(`${environment.apiUrl}/notifiers`).subscribe((value) => (body = value));

    httpMock
      .expectOne(`${environment.apiUrl}/notifiers`)
      .flush({ message: 'Token de autenticación inválido' }, invalidToken);

    // El refresh espera el Web Lock (asíncrono): se resuelve en una microtarea posterior.
    return Promise.resolve()
      .then(() => new Promise((resolve) => setTimeout(resolve)))
      .then(() => {
        httpMock.expectOne(refreshUrl).flush(authResponse('new-token'));
        return new Promise((resolve) => setTimeout(resolve));
      })
      .then(() => {
        const retry = httpMock.expectOne(`${environment.apiUrl}/notifiers`);
        expect(retry.request.headers.get('Authorization')).toBe('Bearer new-token');
        retry.flush({ ok: true });
        expect(body).toEqual({ ok: true });
        expect(session.accessToken()).toBe('new-token');
      });
  });

  it('dos 401 simultáneos comparten una sola renovación', () => {
    http.get(`${environment.apiUrl}/notifiers`).subscribe();
    http.get(`${environment.apiUrl}/transactions`).subscribe();

    httpMock
      .expectOne(`${environment.apiUrl}/notifiers`)
      .flush({ message: 'Token de autenticación inválido' }, invalidToken);
    httpMock
      .expectOne(`${environment.apiUrl}/transactions`)
      .flush({ message: 'Token de autenticación inválido' }, invalidToken);

    return new Promise((resolve) => setTimeout(resolve)).then(() => {
      // Una sola llamada a /auth/refresh: un segundo uso del mismo refresh token revoca la sesión.
      httpMock.expectOne(refreshUrl).flush(authResponse('new-token'));
      return new Promise((resolve) => setTimeout(resolve)).then(() => {
        httpMock.expectOne(`${environment.apiUrl}/notifiers`).flush({});
        httpMock.expectOne(`${environment.apiUrl}/transactions`).flush({});
      });
    });
  });

  it('no renueva ante un 401 que no es de token (p. ej. credenciales)', () => {
    let failed = false;
    http.get(`${environment.apiUrl}/notifiers`).subscribe({ error: () => (failed = true) });

    httpMock
      .expectOne(`${environment.apiUrl}/notifiers`)
      .flush({ message: 'Credenciales inválidas' }, invalidToken);

    httpMock.expectNone(refreshUrl);
    expect(failed).toBe(true);
    expect(session.accessToken()).toBe('old-token');
  });
});
