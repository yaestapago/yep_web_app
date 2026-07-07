import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { OnboardingPage } from './onboarding.page';

/**
 * El onboarding es la pantalla donde cae un usuario recién registrado sin
 * negocio aprobado. Antes exigía pegar el ID completo de Mongo (24
 * caracteres) para "Solicitar acceso", algo que ningún owner comparte — el
 * código corto de invitación (6 caracteres) siempre fallaba la validación.
 * Ahora delega en el mismo modal de código/link/QR que usa el resto de la
 * app. También vivía fuera del Shell sin ninguna salida: se agrega cerrar
 * sesión para no dejar al usuario atrapado aquí.
 */
describe('OnboardingPage — unirse a un negocio y salir sin quedar atrapado', () => {
  let httpMock: HttpTestingController;
  const navigate = vi.fn();
  const navigateByUrl = vi.fn();
  const clearSession = vi.fn();
  const updateMemberships = vi.fn();

  const session = {
    user: () => ({ firstName: 'Staff', lastName: 'Prueba' }),
    memberships: () => [],
    approvedMemberships: () => [],
    pendingMemberships: () => [],
    activeBusinessAccountId: () => null,
    updateMemberships,
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
    page.ngOnInit();
    httpMock.expectOne(`${environment.apiUrl}/business-accounts/memberships`).flush({ memberships: [] });
    return page;
  }

  afterEach(() => {
    httpMock.verify();
    navigate.mockClear();
    navigateByUrl.mockClear();
    clearSession.mockClear();
    updateMemberships.mockClear();
  });

  it('ya no expone un campo que exija el ID completo de Mongo: abre el modal de código/link/QR', () => {
    const page = create();

    expect(page.requestOpen()).toBe(false);
    page.openRequest();
    expect(page.requestOpen()).toBe(true);
    page.closeRequest();
    expect(page.requestOpen()).toBe(false);
  });

  it('al recibir la solicitud del modal, refresca las membresías', () => {
    const page = create();

    page.onRequested();

    httpMock.expectOne(`${environment.apiUrl}/business-accounts/memberships`).flush({ memberships: [] });
    expect(updateMemberships).toHaveBeenCalledTimes(2);
  });

  it('permite cerrar sesión y vuelve al login sin quedar atrapado en onboarding', () => {
    const page = create();

    expect(page.logoutModalOpen()).toBe(false);
    page.openLogout();
    expect(page.logoutModalOpen()).toBe(true);

    page.confirmLogout();

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
