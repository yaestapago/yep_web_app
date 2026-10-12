import { TestBed } from '@angular/core/testing';

import { Radio } from './radio';

describe('Radio', () => {
  function setup(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(Radio);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return { fixture, host, label: host.querySelector('label') as HTMLElement };
  }

  it('marca las clases de estado', () => {
    const { label } = setup({ checked: true, disabled: true });
    expect(label.classList).toContain('yep-radio--checked');
    expect(label.classList).toContain('yep-radio--disabled');
  });

  it('emite selected con su valor', () => {
    const { fixture, host } = setup({ value: 'a', dataCy: 'r' });
    const emitted: string[] = [];
    fixture.componentInstance.selected.subscribe((v) => emitted.push(v));
    (host.querySelector('[data-cy="r"]') as HTMLInputElement).dispatchEvent(new Event('change'));
    expect(emitted).toEqual(['a']);
  });
});
