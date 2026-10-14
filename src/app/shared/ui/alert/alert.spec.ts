import { TestBed } from '@angular/core/testing';

import { Alert } from './alert';

describe('Alert', () => {
  function setup(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(Alert);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return { fixture, host, box: host.querySelector('.yep-alert') as HTMLElement };
  }

  it('usa la variante info por defecto con rol status', () => {
    const { box } = setup();
    expect(box.classList).toContain('yep-alert--info');
    expect(box.getAttribute('role')).toBe('status');
    expect(box.querySelector('.yep-alert__icon svg')).toBeTruthy();
  });

  it.each(['success', 'warning', 'error'] as const)('aplica la variante %s', (variant) => {
    const { box } = setup({ variant });
    expect(box.classList).toContain(`yep-alert--${variant}`);
    const expectedRole = variant === 'success' ? 'status' : 'alert';
    expect(box.getAttribute('role')).toBe(expectedRole);
  });

  it('muestra el título cuando existe', () => {
    const { host } = setup({ title: 'Atención' });
    expect(host.querySelector('.yep-alert__body strong')?.textContent).toContain('Atención');
  });

  it('emite dismissed al cerrar', () => {
    const { fixture, host } = setup({ dismissible: true });
    let count = 0;
    fixture.componentInstance.dismissed.subscribe(() => count++);
    (host.querySelector('.yep-alert__close') as HTMLButtonElement).click();
    expect(count).toBe(1);
  });

  it('no muestra el botón cerrar si no es descartable', () => {
    const { host } = setup();
    expect(host.querySelector('.yep-alert__close')).toBeNull();
  });
});
