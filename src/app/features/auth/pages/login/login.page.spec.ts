import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { LoginPage } from './login.page';

function activatedRouteStub(queryParams: Record<string, string>) {
  return { snapshot: { queryParamMap: convertToParamMap(queryParams) } };
}

async function setup(queryParams: Record<string, string> = {}) {
  await TestBed.configureTestingModule({
    imports: [LoginPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: activatedRouteStub(queryParams) },
    ],
  }).compileComponents();

  const httpMock = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);

  const fixture: ComponentFixture<LoginPage> = TestBed.createComponent(LoginPage);
  // El constructor consulta GET /auth/mail-status (ver MailStatusService).
  httpMock.expectOne(`${environment.apiUrl}/auth/mail-status`).flush({ enabled: true });
  return { fixture, component: fixture.componentInstance, httpMock, router };
}

describe('LoginPage — invitaciones a un negocio (código/link/QR)', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('lee el código y el nombre del negocio desde el link/QR de invitación', async () => {
    const { component, httpMock } = await setup({ code: 'abc123', businessName: 'Café Central' });

    expect(component.inviteCode()).toBe('ABC123');
    expect(component.inviteBusinessName()).toBe('Café Central');
    httpMock.verify();
  });

  it('tras iniciar sesión con una invitación, resuelve el código y solicita acceso staff', async () => {
    vi.useFakeTimers();
    const { fixture, component, httpMock } = await setup({
      code: 'abc123',
      businessName: 'Café Central',
    });

    component.form.setValue({ email: 'ana@example.com', password: 'secret123' });
    component.submit();

    httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush({
      accessToken: 'token',
      user: { id: 'user-1', firstName: 'Ana', lastName: 'Ruiz', email: 'ana@example.com' },
      memberships: [],
    });

    const lookupRequest = httpMock.expectOne(
      (req) =>
        req.url === `${environment.apiUrl}/business-accounts/lookup` &&
        req.params.get('code') === 'ABC123',
    );
    lookupRequest.flush({ businessAccounts: [{ id: 'biz-1', name: 'Café Central', city: 'Bogotá' }] });

    const requestMembershipReq = httpMock.expectOne(
      `${environment.apiUrl}/business-accounts/membership-requests`,
    );
    expect(requestMembershipReq.request.body).toEqual({
      businessAccountId: 'biz-1',
      role: 'account_staff',
    });
    requestMembershipReq.flush({
      membership: {
        id: 'm1',
        businessAccountId: 'biz-1',
        role: 'account_staff',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    expect(component.success()).toContain('Solicitud enviada al negocio');
    fixture.destroy();
  });

  it('no llama a los endpoints de negocio si el usuario entra sin invitación', async () => {
    const { fixture, component, httpMock } = await setup();

    component.form.setValue({ email: 'ana@example.com', password: 'secret123' });
    component.submit();

    httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush({
      accessToken: 'token',
      user: { id: 'user-1', firstName: 'Ana', lastName: 'Ruiz', email: 'ana@example.com' },
      memberships: [],
    });

    httpMock.verify();
    fixture.destroy();
  });

  it('salir de la invitación limpia el estado local, no llama al backend y vuelve al login sin params', async () => {
    const { fixture, component, httpMock, router } = await setup({
      code: 'abc123',
      businessName: 'Café Central',
    });

    component.exitInvite();

    expect(component.inviteCode()).toBe('');
    expect(component.inviteBusinessName()).toBe('');
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    httpMock.verify();
    fixture.destroy();
  });
});
