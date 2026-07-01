import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { RegisterPage } from './register.page';

describe('RegisterPage', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
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
    });

    component.submit();

    const codeRequest = httpMock.expectOne(`${environment.apiUrl}/auth/register/request-code`);
    expect(codeRequest.request.body).toEqual({
      email: 'pedro@example.com',
      identificationNumber: '123456789',
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
});
