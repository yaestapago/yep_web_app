import { TestBed } from '@angular/core/testing';

import { NotificationModal } from './notification-modal';
import { NotificationModalService } from './notification-modal.service';

describe('NotificationModal', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  function setup() {
    const fixture = TestBed.createComponent(NotificationModal);
    const service = TestBed.inject(NotificationModalService);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const render = () => fixture.detectChanges();
    return { fixture, service, el, render };
  }

  it('no muestra nada sin aviso', () => {
    const { el } = setup();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it.each(['info', 'success', 'warning', 'error'] as const)(
    'muestra el aviso %s con su contenedor de icono',
    (type) => {
      const { service, el, render } = setup();
      void service[type]({ title: 'Título', message: ['Uno', 'Dos'] });
      render();
      const icon = el.querySelector('.notification-icon') as HTMLElement;
      expect(icon.classList).toContain(`notification-icon--${type}`);
      expect(icon.querySelector('svg')).toBeTruthy();
      expect(el.querySelector('.notification-modal__content h2')?.textContent).toContain('Título');
      expect(el.querySelectorAll('.notification-modal__content p').length).toBe(2);
      expect(el.querySelector('.yep-modal__header')).toBeNull();
      expect(el.querySelector('.yep-modal__dialog--sm')).toBeTruthy();
      service.close();
    },
  );

  it('confirm resuelve true con la acción primaria y false con la secundaria', async () => {
    const { service, el, render } = setup();
    const first = service.confirm({ title: '¿Seguro?' });
    render();
    let buttons = el.querySelectorAll<HTMLButtonElement>('.yep-modal__footer button');
    expect(buttons.length).toBe(2);
    buttons[1].click();
    await expect(first).resolves.toBe(true);

    const second = service.confirm({ title: '¿Seguro?' });
    render();
    buttons = el.querySelectorAll<HTMLButtonElement>('.yep-modal__footer button');
    buttons[0].click();
    await expect(second).resolves.toBe(false);
  });

  it('el fondo cierra un aviso cerrable y resuelve false', async () => {
    const { service, el, render } = setup();
    const result = service.confirm({ title: '¿Seguro?' });
    render();
    (el.querySelector('.yep-modal__backdrop') as HTMLElement).click();
    await expect(result).resolves.toBe(false);
  });

  it('loading muestra spinner y progreso sin acciones ni cierre por fondo', () => {
    const { service, el, render } = setup();
    const ref = service.loading({ title: 'Procesando' });
    render();
    expect(el.querySelector('.notification-icon--loading .notification-icon__spinner')).toBeTruthy();
    expect(el.querySelector('.notification-progress')).toBeTruthy();
    expect(el.querySelector('.yep-modal__footer button')).toBeNull();
    (el.querySelector('.yep-modal__backdrop') as HTMLElement).click();
    expect(service.state()).not.toBeNull();
    ref.close();
    render();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });
});
