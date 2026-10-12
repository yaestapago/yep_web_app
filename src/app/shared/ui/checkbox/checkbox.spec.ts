import { TestBed } from '@angular/core/testing';

import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  function setup(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(Checkbox);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return { fixture, host, label: host.querySelector('label') as HTMLElement };
  }

  it('dibuja la casilla y marca el estado', () => {
    const { label, host } = setup({ checked: true, dataCy: 'cb' });
    expect(label.classList).toContain('yep-checkbox--checked');
    expect(host.querySelector('.yep-checkbox__box svg')).toBeTruthy();
    expect(host.querySelector('[data-cy="cb"]')).toBeTruthy();
  });

  it('aplica las variantes chip, deshabilitado e inválido', () => {
    const { label, host } = setup({ appearance: 'chip', disabled: true, error: 'x' });
    expect(label.classList).toContain('yep-checkbox--chip');
    expect(label.classList).toContain('yep-checkbox--disabled');
    expect(label.classList).toContain('yep-checkbox--invalid');
    expect(host.querySelector('.yep-checkbox__box')).toBeNull();
  });

  it('emite checkedChange al cambiar', () => {
    const { fixture, host } = setup();
    const emitted: boolean[] = [];
    fixture.componentInstance.checkedChange.subscribe((v) => emitted.push(v));
    (host.querySelector('input') as HTMLInputElement).dispatchEvent(new Event('change'));
    expect(emitted).toEqual([true]);
  });
});
