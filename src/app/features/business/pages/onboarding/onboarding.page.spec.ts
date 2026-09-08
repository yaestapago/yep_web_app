import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { OnboardingPage } from './onboarding.page';

/**
 * El onboarding es la pantalla donde cae un usuario recién registrado sin
 * negocio aprobado. En este flujo solo debe crear un negocio nuevo; la salida
 * de sesión sigue disponible porque la página vive fuera del Shell.
 */
describe('OnboardingPage — crear negocio y salir sin quedar atrapado', () => {
  let httpMock: HttpTestingController;
  const navigate = vi.fn();
  const navigateByUrl = vi.fn();
  const clearSession = vi.fn();

  const session = {
    user: () => ({ firstName: 'Staff', lastName: 'Prueba' }),
    memberships: () => [],
    approvedMemberships: () => [],
    pendingMemberships: () => [],
    activeBusinessAccountId: () => null,
    updateMemberships: vi.fn(),
    setActiveBusinessAccountId: vi.fn(),
    clearSession,
  };

  function create(): OnboardingPage {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate, navigateByUrl } },
        { provide: AuthSessionService, useValue: session },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const page = TestBed.runInInjectionContext(() => new OnboardingPage());
    return page;
  }

  afterEach(() => {
    httpMock.verify();
    navigate.mockClear();
    navigateByUrl.mockClear();
    clearSession.mockClear();
    session.updateMemberships.mockClear();
    session.setActiveBusinessAccountId.mockClear();
  });

  it('crea un negocio y navega a sus datos', () => {
    const page = create();

    page.businessForm.setValue({
      name: 'Cafeteria Centro',
      location: {
        departmentCode: '11',
        departmentName: 'Bogota D.C.',
        cityCode: '11001',
        cityName: 'Bogota',
      },
      address: 'Calle 1 # 2-3',
      phone: { countryCode: '57', nationalNumber: '3001234567', e164: '+573001234567' },
    });

    page.createBusiness();

    httpMock.expectOne(`${environment.apiUrl}/business-accounts`).flush({
      businessAccount: { id: 'business-1', name: 'Cafeteria Centro' },
      membership: {
        id: 'membership-1',
        businessAccountId: 'business-1',
        role: 'owner',
        status: 'approved',
      },
    });

    expect(session.updateMemberships).toHaveBeenCalled();
    expect(session.setActiveBusinessAccountId).toHaveBeenCalledWith('business-1');
    expect(navigate).toHaveBeenCalledWith(['/businesses', 'business-1', 'business-data']);
  });

  it('permite cerrar sesión y vuelve al login sin quedar atrapado en onboarding', () => {
    const page = create();

    expect(page.logoutModalOpen()).toBe(false);
    page.openLogout();
    expect(page.logoutModalOpen()).toBe(true);

    page.confirmLogout();
    httpMock.expectOne(`${environment.apiUrl}/auth/logout`).flush({});

    expect(clearSession).toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/login');
    expect(page.logoutModalOpen()).toBe(false);
  });

  it('cancelar el cierre de sesión no toca la sesión ni navega', () => {
    const page = create();

    page.openLogout();
    page.cancelLogout();

    expect(clearSession).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(page.logoutModalOpen()).toBe(false);
  });
});
