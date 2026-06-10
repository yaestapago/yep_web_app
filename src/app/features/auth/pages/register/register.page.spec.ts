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

  it('submits the user-only registration payload and routes new users to onboarding', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(RegisterPage);
    const component = fixture.componentInstance;

    component.form.setValue({
      firstName: 'Pedro',
      lastName: 'Ramirez',
      email: 'pedro@example.com',
      identificationNumber: '123456789',
      cellphoneNumber: '3001234567',
      password: 'secret123',
      confirmPassword: 'secret123',
    });

    component.submit();

    const request = httpMock.expectOne(`${environment.apiUrl}/auth/register`);
    expect(request.request.body).toEqual({
      firstName: 'Pedro',
      lastName: 'Ramirez',
      email: 'pedro@example.com',
      identificationNumber: '123456789',
      cellphoneNumber: '3001234567',
      password: 'secret123',
    });
    expect(request.request.body).not.toHaveProperty('accountName');

    request.flush({
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
    vi.runAllTimers();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/onboarding');
  });
});
