import { TestBed } from '@angular/core/testing';

import { CheckOption } from './check-option';

describe('CheckOption', () => {
  function setup(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(CheckOption);
    fixture.componentRef.setInput('label', 'Cuenta directa');
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      host,
      row: host.querySelector('label.yep-check-option') as HTMLElement,
      input: host.querySelector('input') as HTMLInputElement,
    };
  }

  it('dibuja etiqueta y meta', () => {
    const { host, input } = setup({ meta: 'Sin llave Bre-B', dataCy: 'op' });
    expect(host.querySelector('.yep-check__label')?.textContent).toContain('Cuenta directa');
    expect(host.querySelector('.yep-check__meta')?.textContent).toContain('Sin llave Bre-B');
    expect(input.getAttribute('data-cy')).toBe('op');
  });

  it('marcado y deshabilitado por clase', () => {
    const { row, input, host } = setup({ checked: true, disabled: true });
    expect(row.classList).toContain('yep-check--on');
    expect(row.classList).toContain('yep-check--disabled');
    expect(input.checked).toBe(true);
    expect(input.disabled).toBe(true);
    expect(host.querySelector('.yep-check__box svg')).not.toBeNull();
    expect(host.querySelector('.yep-check__meta')).toBeNull();
  });

  it('emite checkedChange y respeta el estado controlado', () => {
    const { fixture, input } = setup();
    const emitted: boolean[] = [];
    fixture.componentInstance.checkedChange.subscribe((v) => emitted.push(v));
    input.click();
    expect(emitted).toEqual([true]);
    expect(input.checked).toBe(false);
  });

  it('deshabilitado no emite', () => {
    const { fixture, input } = setup({ disabled: true });
    const emitted: boolean[] = [];
    fixture.componentInstance.checkedChange.subscribe((v) => emitted.push(v));
    input.dispatchEvent(new Event('change'));
    expect(emitted).toEqual([]);
  });
});
