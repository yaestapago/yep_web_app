import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { RequestMembershipModal } from './request-membership-modal';

describe('RequestMembershipModal — unirse a un negocio por código', () => {
  let httpMock: HttpTestingController;
  const updateMemberships = vi.fn();
  const confirm = vi.fn();

  const session = {
    memberships: signal([] as unknown[]),
    updateMemberships,
  };

  function create(): RequestMembershipModal {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthSessionService, useValue: session },
        { provide: NotificationModalService, useValue: { confirm } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.runInInjectionContext(() => new RequestMembershipModal());
  }

  beforeEach(() => {
    session.memberships.set([]);
  });

  afterEach(() => {
    httpMock.verify();
    updateMemberships.mockClear();
    confirm.mockClear();
  });

  it('busca el negocio por código y selecciona automáticamente el único resultado', () => {
    const modal = create();
    modal.form.controls.code.setValue('abc123');

    modal.search();

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${environment.apiUrl}/business-accounts/lookup` && r.params.get('code') === 'abc123',
    );
    req.flush({ businessAccounts: [{ id: 'biz-1', name: 'Café Central', city: 'Bogotá' }] });

    expect(modal.selected()?.id).toBe('biz-1');
  });

  it('deja elegir entre varios negocios cuando el código es ambiguo', () => {
    const modal = create();
    modal.form.controls.code.setValue('abc123');

    modal.search();

    httpMock.expectOne(() => true).flush({
      businessAccounts: [
        { id: 'biz-1', name: 'Negocio Uno', city: 'Cali' },
        { id: 'biz-2', name: 'Negocio Dos', city: 'Medellín' },
      ],
    });

    expect(modal.matches()).toHaveLength(2);
    expect(modal.selected()).toBeNull();

    modal.pickMatch('biz-2');

    expect(modal.selected()?.id).toBe('biz-2');
  });

  it('no busca si el código tiene menos de 6 caracteres', () => {
    const modal = create();
    modal.form.controls.code.setValue('abc');

    modal.search();

    httpMock.expectNone(() => true);
    expect(modal.form.controls.code.touched).toBe(true);
  });

  it('envía la solicitud de membresía para el negocio resuelto por código', () => {
    const modal = create();
    modal.form.setValue({ code: 'abc123', role: 'account_staff' });
    modal.search();
    httpMock
      .expectOne(() => true)
      .flush({ businessAccounts: [{ id: 'biz-1', name: 'Café Central', city: 'Bogotá' }] });

    modal.submit();

    const req = httpMock.expectOne(`${environment.apiUrl}/business-accounts/membership-requests`);
    expect(req.request.body).toEqual({ businessAccountId: 'biz-1', role: 'account_staff' });
    req.flush({
      membership: {
        id: 'm1',
        businessAccountId: 'biz-1',
        role: 'account_staff',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    expect(updateMemberships).toHaveBeenCalled();
    expect(modal.success()).toContain('Solicitud enviada');
  });

  it('no reenvía la solicitud si ya existe una pendiente para ese negocio', () => {
    session.memberships.set([{ id: 'm1', businessAccountId: 'biz-1', status: 'pending' }]);
    const modal = create();
    modal.form.setValue({ code: 'abc123', role: 'account_staff' });
    modal.search();
    httpMock
      .expectOne(() => true)
      .flush({ businessAccounts: [{ id: 'biz-1', name: 'Café Central', city: 'Bogotá' }] });

    modal.submit();

    httpMock.expectNone(`${environment.apiUrl}/business-accounts/membership-requests`);
    expect(modal.success()).toContain('pendiente');
  });

  // --- Salir / cancelar: no debe tocar el backend ni la invitación --------

  it('cancelar sin cambios sin guardar cierra directo, sin pedir confirmación', async () => {
    const modal = create();
    const emitSpy = vi.spyOn(modal.closeRequested, 'emit');

    await modal.close();

    expect(confirm).not.toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalled();
    httpMock.verify();
  });

  it('cancelar con datos sin guardar pide confirmación antes de cerrar', async () => {
    const modal = create();
    modal.form.controls.code.setValue('abc123');
    modal.form.markAsDirty();
    const emitSpy = vi.spyOn(modal.closeRequested, 'emit');
    confirm.mockResolvedValue(false);

    await modal.close();

    expect(confirm).toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
    httpMock.verify();
  });

  it('confirmar el descarte sí cierra el modal', async () => {
    const modal = create();
    modal.form.markAsDirty();
    const emitSpy = vi.spyOn(modal.closeRequested, 'emit');
    confirm.mockResolvedValue(true);

    await modal.close();

    expect(emitSpy).toHaveBeenCalled();
  });

  it('cerrar tras una solicitud enviada exitosamente no pide confirmación (no hay nada que descartar)', () => {
    const modal = create();
    modal.form.setValue({ code: 'abc123', role: 'account_staff' });
    modal.search();
    httpMock
      .expectOne(() => true)
      .flush({ businessAccounts: [{ id: 'biz-1', name: 'Café Central', city: 'Bogotá' }] });
    modal.submit();
    httpMock.expectOne(`${environment.apiUrl}/business-accounts/membership-requests`).flush({
      membership: {
        id: 'm1',
        businessAccountId: 'biz-1',
        role: 'account_staff',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    // Simula que el usuario escribió en el campo (setValue programático no
    // marca dirty por sí solo, a diferencia de la interacción real en el DOM).
    modal.form.markAsDirty();
    expect(modal.success()).not.toBe('');
    const emitSpy = vi.spyOn(modal.closeRequested, 'emit');

    void modal.close();

    expect(confirm).not.toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalled();
  });
});
