import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { RegisterPage } from './register.page';

function activatedRouteStub(queryParams: Record<string, string>) {
  return { snapshot: { queryParamMap: convertToParamMap(queryParams) } };
}

describe('RegisterPage', () => {
  let httpMock: HttpTestingController;
  let router: Router;
  let notifications: NotificationModalService;

  async function configure(queryParams: Record<string, string> = {}) {
    localStorage.clear();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: activatedRouteStub(queryParams) },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    notifications = TestBed.inject(NotificationModalService);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  }

  beforeEach(async () => {
    await configure();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('requests an email code before registering and routes new users to onboarding', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(RegisterPage);
    const component = fixture.componentInstance;

    component.form.setValue({
      firstName: 'Pedro',
      lastName: 'Ramirez',
      email: 'pedro@example.com',
      identificationNumber: '123456789',
      cellphoneNumber: {
        countryCode: '57',
        nationalNumber: '3001234567',
        e164: '+573001234567',
      },
      password: 'secret123',
      confirmPassword: 'secret123',
      acceptTerms: true,
    });

    component.submit();

    const codeRequest = httpMock.expectOne(`${environment.apiUrl}/auth/register/request-code`);
    expect(codeRequest.request.body).toEqual({
      email: 'pedro@example.com',
      identificationNumber: '123456789',
      cellphoneNumber: '+573001234567',
    });
    codeRequest.flush({
      message: 'Te enviamos un codigo de verificacion al correo registrado.',
      resendInSeconds: 60,
    });

    expect(component.step()).toBe('code');

    component.completeRegistration('123456');

    const registerRequest = httpMock.expectOne(`${environment.apiUrl}/auth/register`);
    expect(registerRequest.request.body).toEqual({
      firstName: 'Pedro',
      lastName: 'Ramirez',
      email: 'pedro@example.com',
      identificationNumber: '123456789',
      cellphoneNumber: '+573001234567',
      password: 'secret123',
      verificationCode: '123456',
      acceptedTerms: true,
      termsVersion: '2026-07',
    });
    expect(registerRequest.request.body).not.toHaveProperty('accountName');

    registerRequest.flush({
      accessToken: 'token',
      user: {
        id: 'user-1',
        firstName: 'Pedro',
        lastName: 'Ramirez',
        email: 'pedro@example.com',
        identificationNumber: '123456789',
        cellphoneNumber: '3001234567',
      },
      memberships: [],
    });
    vi.advanceTimersByTime(450);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/onboarding');
    fixture.destroy();
  });

  it('marks cellphone number as duplicated when the registration code request is rejected', () => {
    const fixture = TestBed.createComponent(RegisterPage);
    const component = fixture.componentInstance;

    component.form.setValue({
      firstName: 'Pedro',
      lastName: 'Ramirez',
      email: 'pedro@example.com',
      identificationNumber: '123456789',
      cellphoneNumber: {
        countryCode: '57',
        nationalNumber: '3001234567',
        e164: '+573001234567',
      },
      password: 'secret123',
      confirmPassword: 'secret123',
      acceptTerms: true,
    });

    component.submit();

    const codeRequest = httpMock.expectOne(`${environment.apiUrl}/auth/register/request-code`);
    codeRequest.flush(
      { message: 'Ya existe un usuario con este teléfono' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(component.form.controls.cellphoneNumber.hasError('serverDuplicate')).toBe(true);
    expect(component.cellphoneNumberError()).toBe('Ya existe una cuenta con este celular.');
    fixture.destroy();
  });

  it('shows a modal and stays on register when email already exists and the user cancels', async () => {
    const fixture = TestBed.createComponent(RegisterPage);
    const component = fixture.componentInstance;

    component.form.setValue({
      firstName: 'Pedro',
      lastName: 'Ramirez',
      email: 'pedro@example.com',
      identificationNumber: '123456789',
      cellphoneNumber: {
        countryCode: '57',
        nationalNumber: '3001234567',
        e164: '+573001234567',
      },
      password: 'secret123',
      confirmPassword: 'secret123',
      acceptTerms: true,
    });

    component.submit();

    const codeRequest = httpMock.expectOne(`${environment.apiUrl}/auth/register/request-code`);
    codeRequest.flush(
      { message: 'Ya existe un usuario con este email' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(component.error()).toBe('');
    expect(component.success()).toBe('');
    expect(component.form.controls.email.hasError('serverDuplicate')).toBe(true);
    expect(notifications.state()?.title).toBe('Ya tienes una cuenta');
    expect(router.navigate).not.toHaveBeenCalled();

    notifications.resolve(false);
    await Promise.resolve();

    expect(router.navigate).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('shows a modal and navigates to login after confirmation when email already exists', async () => {
    const fixture = TestBed.createComponent(RegisterPage);
    const component = fixture.componentInstance;

    component.form.setValue({
      firstName: 'Pedro',
      lastName: 'Ramirez',
      email: 'pedro@example.com',
      identificationNumber: '123456789',
      cellphoneNumber: {
        countryCode: '57',
        nationalNumber: '3001234567',
        e164: '+573001234567',
      },
      password: 'secret123',
      confirmPassword: 'secret123',
      acceptTerms: true,
    });

    component.submit();

    const codeRequest = httpMock.expectOne(`${environment.apiUrl}/auth/register/request-code`);
    codeRequest.flush(
      { message: 'Ya existe un usuario con este email' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(notifications.state()?.title).toBe('Ya tienes una cuenta');

    notifications.resolve(true);
    await Promise.resolve();

    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: {} });
    fixture.destroy();
  });

  it('marks email as blocked and shows a clear modal for temporary email domains', () => {
    const fixture = TestBed.createComponent(RegisterPage);
    const component = fixture.componentInstance;

    component.form.setValue({
      firstName: 'Pedro',
      lastName: 'Ramirez',
      email: 'pedro@yopmail.com',
      identificationNumber: '123456789',
      cellphoneNumber: {
        countryCode: '57',
        nationalNumber: '3001234567',
        e164: '+573001234567',
      },
      password: 'secret123',
      confirmPassword: 'secret123',
      acceptTerms: true,
    });

    component.submit();

    const codeRequest = httpMock.expectOne(`${environment.apiUrl}/auth/register/request-code`);
    codeRequest.flush(
      {
        message:
          'No aceptamos correos temporales. Usa un correo personal o corporativo válido para crear tu cuenta.',
      },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(component.form.controls.email.hasError('serverBlockedEmailDomain')).toBe(true);
    expect(component.emailError()).toBe('Usa un correo personal o corporativo válido.');
    expect(notifications.state()?.title).toBe('Correo no permitido');
    expect(router.navigate).not.toHaveBeenCalled();
    fixture.destroy();
  });
});

describe('RegisterPage — invitación a un negocio (código/link/QR)', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  async function configure(queryParams: Record<string, string> = {}) {
    localStorage.clear();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: activatedRouteStub(queryParams) },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  }

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('lee el código y el negocio desde el link/QR y los muestra en el banner', async () => {
    await configure({ code: 'abc123', businessName: 'Café Central' });
    const fixture = TestBed.createComponent(RegisterPage);

    expect(fixture.componentInstance.inviteCode()).toBe('ABC123');
    expect(fixture.componentInstance.inviteBusinessName()).toBe('Café Central');
    fixture.destroy();
  });

  it('tras registrarse con una invitación, resuelve el código y solicita acceso staff', async () => {
    vi.useFakeTimers();
    await configure({ code: 'abc123', businessName: 'Café Central' });
    const fixture = TestBed.createComponent(RegisterPage);
    const component = fixture.componentInstance;

    component.form.setValue({
      firstName: 'Pedro',
      lastName: 'Ramirez',
      email: 'pedro@example.com',
      identificationNumber: '123456789',
      cellphoneNumber: { countryCode: '57', nationalNumber: '3001234567', e164: '+573001234567' },
      password: 'secret123',
      confirmPassword: 'secret123',
      acceptTerms: true,
    });
    component.submit();

    const codeRequest = httpMock.expectOne(`${environment.apiUrl}/auth/register/request-code`);
    expect(codeRequest.request.body).toEqual({
      email: 'pedro@example.com',
      identificationNumber: '123456789',
      cellphoneNumber: '+573001234567',
    });
    codeRequest.flush({
      message: 'Te enviamos un codigo de verificacion al correo registrado.',
      resendInSeconds: 60,
    });
    component.completeRegistration('123456');

    httpMock.expectOne(`${environment.apiUrl}/auth/register`).flush({
      accessToken: 'token',
      user: {
        id: 'user-1',
        firstName: 'Pedro',
        lastName: 'Ramirez',
        email: 'pedro@example.com',
        identificationNumber: '123456789',
        cellphoneNumber: '3001234567',
      },
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

  it('salir de la invitación limpia el estado local, no llama al backend y vuelve al login sin invitación', async () => {
    await configure({ code: 'abc123', businessName: 'Café Central' });
    const fixture = TestBed.createComponent(RegisterPage);
    const component = fixture.componentInstance;

    component.exitInvite();

    expect(component.inviteCode()).toBe('');
    expect(component.inviteBusinessName()).toBe('');
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    httpMock.verify();
    fixture.destroy();
  });
});
