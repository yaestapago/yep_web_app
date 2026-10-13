import { TestBed } from '@angular/core/testing';

import { Toggle } from './toggle';

describe('Toggle', () => {
  function setup(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(Toggle);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return { fixture, button: host.querySelector('button') as HTMLButtonElement };
  }

  it('dibuja el interruptor con role switch', () => {
    const { button } = setup({ pressed: true });
    expect(button.classList).toContain('yep-toggle--switch');
    expect(button.classList).toContain('yep-toggle--on');
    expect(button.getAttribute('role')).toBe('switch');
    expect(button.getAttribute('aria-checked')).toBe('true');
  });

  it('dibuja la píldora con aria-pressed', () => {
    const { button } = setup({ appearance: 'button', label: 'Filtro' });
    expect(button.classList).toContain('yep-toggle--button');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('emite toggled con el valor contrario', () => {
    const { fixture, button } = setup({ pressed: false });
    const emitted: boolean[] = [];
    fixture.componentInstance.toggled.subscribe((v) => emitted.push(v));
    button.click();
    expect(emitted).toEqual([true]);
  });
});
