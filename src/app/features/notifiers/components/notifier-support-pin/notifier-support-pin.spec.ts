import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { NotifierSupportPinApiService } from '../../services/notifier-support-pin-api.service';
import { NotifierSupportPin, validateSupportPin } from './notifier-support-pin';

describe('validateSupportPin', () => {
  it('solo dígitos, de 6 a 8', () => {
    expect(validateSupportPin('', '').pin).toBe('Escribe el PIN.');
    expect(validateSupportPin('12345', '12345').pin).toBe('Solo números, de 6 a 8 dígitos.');
    expect(validateSupportPin('123456789', '123456789').pin).toBe(
      'Solo números, de 6 a 8 dígitos.',
    );
    expect(validateSupportPin('12a456', '12a456').pin).toBe('Solo números, de 6 a 8 dígitos.');
    expect(validateSupportPin(' 123456', ' 123456').pin).toBeDefined();
    expect(validateSupportPin('123456', '123456')).toEqual({});
    expect(validateSupportPin('12345678', '12345678')).toEqual({});
  });

  it('la confirmación debe coincidir', () => {
    expect(validateSupportPin('482913', '').confirm).toBe('Repite el PIN.');
    expect(validateSupportPin('482913', '482914').confirm).toBe('Los dos PIN no coinciden.');
    // Si el PIN ya está mal, no se repite el error en la confirmación.
    expect(validateSupportPin('12', '13').confirm).toBeUndefined();
  });
});

describe('NotifierSupportPin (tarjeta)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let confirm: ReturnType<typeof vi.fn>;

  function create(): {
    fixture: ComponentFixture<NotifierSupportPin>;
    card: NotifierSupportPin;
    root: HTMLElement;
  } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: NotifierSupportPinApiService, useValue: api },
        { provide: NotificationModalService, useValue: { confirm } },
      ],
    });
    const fixture = TestBed.createComponent(NotifierSupportPin);
    fixture.detectChanges();
    return {
      fixture,
      card: fixture.componentInstance,
      root: fixture.nativeElement as HTMLElement,
    };
  }

  const text = (root: HTMLElement, id: string) =>
    root.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

  beforeEach(() => {
    api = {
      status: vi.fn().mockReturnValue(of({ configured: false, updatedAt: null })),
      setPin: vi
        .fn()
        .mockReturnValue(of({ configured: true, updatedAt: '2026-10-15T15:00:00.000Z' })),
    };
    confirm = vi.fn().mockResolvedValue(true);
  });

  it('explica para qué sirve el PIN', () => {
    const { root } = create();
    expect(text(root, 'notifier-support-pin')).toContain(
      'Lo pide el Notificador en Configuración → Modo soporte para ver reglas y datos técnicos. No se lo des a los clientes.',
    );
  });

  it('sin PIN: lo dice y muestra el formulario para fijarlo', () => {
    const { root } = create();
    expect(api['status']).toHaveBeenCalledTimes(1);
    expect(text(root, 'support-pin-chip')).toBe('Sin configurar');
    expect(text(root, 'support-pin-status')).toBe(
      'Todavía no hay PIN: nadie puede abrir el modo soporte.',
    );
    expect(root.querySelector('[data-testid="support-pin-form"]')).not.toBeNull();
    expect(text(root, 'support-pin-save')).toBe('Fijar PIN');
    // Oculto: los dos campos son de contraseña.
    const inputs = root.querySelectorAll<HTMLInputElement>(
      '[data-testid="support-pin-form"] input',
    );
    expect([...inputs].map((input) => input.type)).toEqual(['password', 'password']);
  });

  it('no guarda con errores y los muestra en el formulario', async () => {
    const { fixture, card, root } = create();
    card.pin.set('1234');
    card.confirm.set('1234');
    await card.save();
    fixture.detectChanges();
    expect(api['setPin']).not.toHaveBeenCalled();
    expect(text(root, 'support-pin-input')).toContain('Solo números, de 6 a 8 dígitos.');

    card.pin.set('482913');
    card.confirm.set('482910');
    await card.save();
    fixture.detectChanges();
    expect(api['setPin']).not.toHaveBeenCalled();
    expect(text(root, 'support-pin-confirm')).toContain('Los dos PIN no coinciden.');
  });

  it('fija el primer PIN sin pedir confirmación y limpia el formulario', async () => {
    const { fixture, card, root } = create();
    card.pin.set('482913');
    card.confirm.set('482913');
    await card.save();
    fixture.detectChanges();
    expect(confirm).not.toHaveBeenCalled();
    expect(api['setPin']).toHaveBeenCalledWith('482913');
    expect(card.pin()).toBe('');
    expect(card.confirm()).toBe('');
    expect(text(root, 'support-pin-chip')).toBe('Configurado');
    expect(text(root, 'support-pin-status')).toMatch(/^Configurado\. Último cambio: /);
    expect(root.querySelector('[data-testid="support-pin-form"]')).toBeNull();
    expect(root.textContent).toContain('PIN guardado. Compártelo solo con el equipo de YEP.');
  });

  it('con PIN: muestra cuándo se cambió, y cambiarlo pide confirmación', async () => {
    api['status'].mockReturnValue(of({ configured: true, updatedAt: '2026-10-01T14:30:00.000Z' }));
    const { fixture, card, root } = create();
    expect(text(root, 'support-pin-chip')).toBe('Configurado');
    expect(text(root, 'support-pin-status')).toMatch(/^Configurado\. Último cambio: .*2026/);
    expect(root.querySelector('[data-testid="support-pin-form"]')).toBeNull();

    (root.querySelector('[data-testid="support-pin-change"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(text(root, 'support-pin-save')).toBe('Guardar PIN nuevo');

    confirm.mockResolvedValueOnce(false);
    card.pin.set('77889900');
    card.confirm.set('77889900');
    await card.save();
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Cambiar el PIN de soporte', confirmText: 'Cambiar PIN' }),
    );
    expect(api['setPin']).not.toHaveBeenCalled();

    await card.save();
    expect(api['setPin']).toHaveBeenCalledWith('77889900');
  });

  it('cancelar cierra el formulario y borra lo escrito', () => {
    api['status'].mockReturnValue(of({ configured: true, updatedAt: null }));
    const { fixture, card, root } = create();
    expect(text(root, 'support-pin-status')).toBe('Configurado.');
    card.startEditing();
    card.pin.set('123456');
    card.cancel();
    fixture.detectChanges();
    expect(card.pin()).toBe('');
    expect(root.querySelector('[data-testid="support-pin-form"]')).toBeNull();
  });

  it('muestra el 400 del backend', async () => {
    api['setPin'].mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: ['pin debe tener solo dígitos, de 6 a 8'] },
          }),
      ),
    );
    const { fixture, card, root } = create();
    card.pin.set('482913');
    card.confirm.set('482913');
    await card.save();
    fixture.detectChanges();
    expect(root.textContent).toContain('pin debe tener solo dígitos, de 6 a 8');
    expect(card.pin()).toBe('482913');
  });

  it('si no carga el estado, deja reintentar', () => {
    api['status'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0, error: null })),
    );
    const { root } = create();
    expect(root.textContent).toContain('No fue posible conectar con el backend.');
    expect(root.textContent).toContain('Reintentar');
    expect(root.querySelector('[data-testid="support-pin-form"]')).toBeNull();
  });
});
