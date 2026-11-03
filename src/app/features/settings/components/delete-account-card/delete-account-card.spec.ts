import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { AuthResponse, User } from '../../../../shared/models/auth.models';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { OtpInput } from '../../../../shared/ui/otp-input/otp-input';
import { DeleteAccountCard } from './delete-account-card';

const previewUrl = `${environment.apiUrl}/auth/me/deletion/preview`;
const requestUrl = `${environment.apiUrl}/auth/me/deletion/request`;
const confirmUrl = `${environment.apiUrl}/auth/me/deletion/confirm`;

const preview = {
  businessesToDelete: [{ id: 'b1', name: 'Tienda Sola' }],
  businessesToLeave: [{ id: 'b2', name: 'Cafe Compartido' }],
};

function authResponse(user: Partial<User> = {}): AuthResponse {
  return {
    accessToken: 'token',
    user: {
      id: 'user-1',
      firstName: 'Pedro',
      lastName: 'Ramirez',
      email: 'pedro@example.com',
      identificationNumber: '123456789',
      cellphoneNumber: '3001234567',
      ...user,
    },
    memberships: [],
  };
}

describe('DeleteAccountCard', () => {
  let httpMock: HttpTestingController;
  let session: AuthSessionService;
  let fixture: ComponentFixture<DeleteAccountCard>;
  let component: DeleteAccountCard;

  function setup(user: Partial<User> = {}): HTMLElement {
    session.saveSession(authResponse(user));
    fixture = TestBed.createComponent(DeleteAccountCard);
    component = fixture.componentInstance;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function openNotice(): void {
    component.start();
    httpMock.expectOne(previewUrl).flush(preview);
    fixture.detectChanges();
  }

  function reachCodeStep(): void {
    openNotice();
    component.continueToPassword();
    component.passwordForm.setValue({ password: 'secreta' });
    component.submitPassword();
    httpMock.expectOne(requestUrl).flush({ sent: true, resendInSeconds: 60 });
    fixture.detectChanges();
  }

  const forbidden = { status: 403, statusText: 'Forbidden' };
  const unauthorized = { status: 401, statusText: 'Unauthorized' };
  const tooMany = { status: 429, statusText: 'Too Many Requests' };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DeleteAccountCard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSessionService);
  });

  afterEach(() => {
    fixture?.destroy();
    httpMock.verify();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('muestra la acción a un usuario normal sin llamar al backend hasta que la pide', () => {
    const element = setup();

    expect(element.textContent).toContain('Zona de peligro');
    expect(element.textContent).toContain('Eliminar cuenta');
    httpMock.expectNone(previewUrl);
  });

  it('a una cuenta de soporte le muestra el mensaje y no le ofrece el flujo', () => {
    const element = setup({ globalRole: 'support' });

    expect(element.textContent).toContain('Las cuentas de soporte no se pueden eliminar');
    expect(element.querySelector('yep-button')).toBeNull();
  });

  it('muestra qué negocios se borran, de cuáles solo sale y que es permanente', () => {
    const element = setup();
    openNotice();

    const toDelete = element.querySelector('[data-cy="businesses-to-delete"]')?.textContent;
    expect(toDelete).toContain('Tienda Sola');
    expect(toDelete).not.toContain('Cafe Compartido');
    expect(element.querySelector('[data-cy="businesses-to-leave"]')?.textContent).toContain(
      'Cafe Compartido',
    );
    expect(element.textContent).toContain('permanente');
  });

  it('sin negocios explica que solo se elimina la cuenta', () => {
    const element = setup();
    component.start();
    httpMock.expectOne(previewUrl).flush({ businessesToDelete: [], businessesToLeave: [] });
    fixture.detectChanges();

    expect(element.textContent).toContain('solo se elimina tu cuenta');
  });

  it('no abre el flujo si falla el preview y permite reintentar', () => {
    setup();
    component.start();
    httpMock
      .expectOne(previewUrl)
      .flush({ message: 'Servicio no disponible' }, { status: 503, statusText: 'Unavailable' });

    expect(component.modalOpen()).toBe(false);
    expect(component.previewError()).toBe('Servicio no disponible');

    openNotice();
    expect(component.modalOpen()).toBe(true);
    expect(component.previewError()).toBe('');
  });

  it('un 403 en el preview oculta el flujo y muestra el mensaje de soporte', () => {
    const element = setup();
    component.start();
    httpMock.expectOne(previewUrl).flush({ message: 'Forbidden resource' }, forbidden);
    fixture.detectChanges();

    expect(component.canDelete()).toBe(false);
    expect(component.modalOpen()).toBe(false);
    expect(element.textContent).toContain('Las cuentas de soporte no se pueden eliminar');
  });

  it('exige contraseña antes de pedir el código', () => {
    setup();
    openNotice();
    component.continueToPassword();
    component.submitPassword();

    httpMock.expectNone(requestUrl);
    expect(component.passwordFieldError()).toBe('Escribe tu contraseña.');
  });

  it('con contraseña incorrecta se queda en el paso y lo dice en español', () => {
    setup();
    openNotice();
    component.continueToPassword();
    component.passwordForm.setValue({ password: 'mala' });
    component.submitPassword();

    const request = httpMock.expectOne(requestUrl);
    expect(request.request.body).toEqual({ password: 'mala' });
    request.flush({ message: 'Contraseña inválida' }, unauthorized);

    expect(component.step()).toBe('password');
    expect(component.passwordError()).toContain('contraseña no es correcta');
  });

  it('avisa del límite de intentos al pedir el código', () => {
    setup();
    openNotice();
    component.continueToPassword();
    component.passwordForm.setValue({ password: 'secreta' });
    component.submitPassword();

    httpMock
      .expectOne(requestUrl)
      .flush({ message: 'Too Many Requests', retryAfterSeconds: 120 }, tooMany);

    expect(component.step()).toBe('password');
    expect(component.passwordError()).toBe(
      'Hiciste demasiados intentos. Vuelve a intentarlo en 2 minutos.',
    );
  });

  it('con contraseña correcta pasa al código y arranca la espera de reenvío', () => {
    const element = setup();
    reachCodeStep();

    expect(component.step()).toBe('code');
    expect(component.resendSeconds()).toBe(60);
    expect(element.textContent).toContain('pedro@example.com');
    expect(element.textContent).toContain('se elimina de inmediato');
  });

  it('con código incorrecto o vencido muestra el error y conserva la sesión', () => {
    setup();
    reachCodeStep();
    component.confirmCode('000000');

    httpMock.expectOne(confirmUrl).flush({ message: 'Código inválido o vencido' }, unauthorized);

    expect(component.otpStatus()).toBe('error');
    expect(component.otpError()).toContain('no es correcto o ya venció');
    expect(session.isAuthenticated()).toBe(true);
    expect(component.modalOpen()).toBe(true);
  });

  it('avisa del límite de intentos al confirmar', () => {
    setup();
    reachCodeStep();
    component.confirmCode('000000');

    httpMock.expectOne(confirmUrl).flush({}, tooMany);

    expect(component.otpError()).toBe(
      'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
    );
  });

  it('reenvía con la misma contraseña, limpia las casillas y reinicia la espera', () => {
    setup();
    reachCodeStep();

    component.resendCode();
    httpMock.expectNone(requestUrl);

    component.resendSeconds.set(0);
    const otp = fixture.debugElement.query((node) => node.componentInstance instanceof OtpInput)
      .componentInstance as OtpInput;
    otp.writeValue('123456');

    component.resendCode();
    const request = httpMock.expectOne(requestUrl);
    expect(request.request.body).toEqual({ password: 'secreta' });
    request.flush({ sent: true, resendInSeconds: 30 });

    expect(otp.value()).toBe('');
    expect(component.resendSeconds()).toBe(30);
    expect(component.otpStatus()).toBe('idle');
  });

  it('muestra el error del reenvío en el paso del código', () => {
    setup();
    reachCodeStep();
    component.resendSeconds.set(0);

    component.resendCode();
    httpMock.expectOne(requestUrl).flush({}, tooMany);

    expect(component.step()).toBe('code');
    expect(component.otpStatus()).toBe('error');
    expect(component.otpError()).toContain('demasiados intentos');
  });

  it('un 403 al confirmar cierra el flujo y conserva la sesión', () => {
    setup();
    reachCodeStep();
    component.confirmCode('123456');

    httpMock.expectOne(confirmUrl).flush({ message: 'Forbidden resource' }, forbidden);

    expect(component.canDelete()).toBe(false);
    expect(component.modalOpen()).toBe(false);
    expect(session.isAuthenticated()).toBe(true);
  });

  it('al confirmar limpia la sesión, lleva a login y avisa', () => {
    const navigateByUrl = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);
    const success = vi
      .spyOn(TestBed.inject(NotificationModalService), 'success')
      .mockResolvedValue();
    setup();
    reachCodeStep();
    component.confirmCode('123456');

    const request = httpMock.expectOne(confirmUrl);
    expect(request.request.body).toEqual({ code: '123456' });
    // Sin credenciales el navegador ignora la cookie que limpia el backend.
    expect(request.request.withCredentials).toBe(true);
    request.flush({ deleted: true });

    expect(session.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('yep_web.auth_session')).toBeNull();
    expect(navigateByUrl).toHaveBeenCalledWith('/login');
    expect(success).toHaveBeenCalledOnce();
    expect(component.modalOpen()).toBe(false);
  });

  it('limpia la sesión aunque la persona haya salido de la página mientras se confirmaba', () => {
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    setup();
    reachCodeStep();
    component.confirmCode('123456');
    const request = httpMock.expectOne(confirmUrl);

    fixture.destroy();
    request.flush({ deleted: true });

    expect(session.isAuthenticated()).toBe(false);
  });

  it('no deja cerrar el modal mientras se confirma y al cerrar olvida la contraseña', () => {
    setup();
    reachCodeStep();
    component.confirmCode('000000');

    component.close();
    expect(component.modalOpen()).toBe(true);

    httpMock.expectOne(confirmUrl).flush({}, unauthorized);
    component.close();

    expect(component.modalOpen()).toBe(false);
    expect(component.passwordForm.getRawValue().password).toBe('');
  });
});
