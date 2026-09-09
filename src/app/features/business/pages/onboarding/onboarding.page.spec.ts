import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { BusinessMembership } from '../../../../shared/models/auth.models';
import { OnboardingPage } from './onboarding.page';

/**
 * El onboarding es la pantalla donde cae un usuario sin negocio aprobado. Puede
 * crear un negocio nuevo o esperar la aprobacion de una solicitud staff.
 */
describe('OnboardingPage - crear negocio, esperar aprobacion y salir sin quedar atrapado', () => {
  let httpMock: HttpTestingController;
  const navigate = vi.fn();
  const navigateByUrl = vi.fn();
  const clearSession = vi.fn();
  let memberships: BusinessMembership[] = [];
  let approvedMemberships: BusinessMembership[] = [];
  let pendingMemberships: BusinessMembership[] = [];

  const session = {
    user: () => ({ firstName: 'Staff', lastName: 'Prueba' }),
    memberships: () => memberships,
    approvedMemberships: () => approvedMemberships,
    pendingMemberships: () => pendingMemberships,
    activeBusinessAccountId: () => null,
    updateUser: vi.fn(),
    updateSubscription: vi.fn(),
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
    return TestBed.runInInjectionContext(() => new OnboardingPage());
  }

  beforeEach(() => {
    memberships = [];
    approvedMemberships = [];
    pendingMemberships = [];
  });

  afterEach(() => {
    httpMock.verify();
    navigate.mockClear();
    navigateByUrl.mockClear();
    clearSession.mockClear();
    session.updateUser.mockClear();
    session.updateSubscription.mockClear();
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
        role: 'account_owner',
        status: 'approved',
        locationIds: [],
      },
    });

    expect(session.updateMemberships).toHaveBeenCalled();
    expect(session.setActiveBusinessAccountId).toHaveBeenCalledWith('business-1');
    expect(navigate).toHaveBeenCalledWith(['/businesses', 'business-1', 'business-data']);
  });

  it('detecta solicitudes staff pendientes para mostrar la espera de aprobacion', () => {
    pendingMemberships = [
      {
        id: 'membership-pending',
        businessAccountId: 'business-1',
        role: 'account_staff',
        status: 'pending',
        locationIds: [],
        businessAccount: {
          id: 'business-1',
          name: 'Cafe Central',
          departmentCode: '11',
          departmentName: 'Bogota D.C.',
          cityCode: '11001',
          cityName: 'Bogota',
          address: 'Calle 1 # 2-3',
          phone: '+573001234567',
        },
      },
    ];
    memberships = pendingMemberships;
    const page = create();

    expect(page.hasPendingStaffAccess()).toBe(true);
    expect(page.pendingBusinessName(pendingMemberships[0])).toBe('Cafe Central');
    expect(page.pendingBusinessLocation(pendingMemberships[0])).toBe('Bogota, Bogota D.C.');
  });

  it('actualiza el estado y mantiene al usuario en espera si la solicitud sigue pendiente', () => {
    pendingMemberships = [
      {
        id: 'membership-pending',
        businessAccountId: 'business-1',
        role: 'account_staff',
        status: 'pending',
        locationIds: [],
      },
    ];
    memberships = pendingMemberships;
    const page = create();

    page.refreshAccessStatus();

    httpMock.expectOne(`${environment.apiUrl}/auth/me`).flush({
      user: { id: 'user-1', firstName: 'Staff', lastName: 'Prueba' },
      subscription: null,
      memberships: pendingMemberships,
    });

    expect(session.updateUser).toHaveBeenCalled();
    expect(session.updateSubscription).toHaveBeenCalledWith(null);
    expect(session.updateMemberships).toHaveBeenCalledWith(pendingMemberships);
    expect(page.success()).toBe('Tu solicitud sigue pendiente de aprobación.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('actualiza el estado y entra al dashboard cuando el owner aprueba la solicitud', () => {
    const approved: BusinessMembership = {
      id: 'membership-approved',
      businessAccountId: 'business-1',
      role: 'account_staff',
      status: 'approved',
      locationIds: [],
    };
    approvedMemberships = [approved];
    const page = create();

    page.refreshAccessStatus();

    httpMock.expectOne(`${environment.apiUrl}/auth/me`).flush({
      user: { id: 'user-1', firstName: 'Staff', lastName: 'Prueba' },
      subscription: null,
      memberships: [approved],
    });

    expect(session.setActiveBusinessAccountId).toHaveBeenCalledWith('business-1');
    expect(navigate).toHaveBeenCalledWith(['/businesses', 'business-1', 'dashboard']);
  });

  it('permite cerrar sesion y vuelve al login sin quedar atrapado en onboarding', () => {
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

  it('cancelar el cierre de sesion no toca la sesion ni navega', () => {
    const page = create();

    page.openLogout();
    page.cancelLogout();

    expect(clearSession).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(page.logoutModalOpen()).toBe(false);
  });
});
