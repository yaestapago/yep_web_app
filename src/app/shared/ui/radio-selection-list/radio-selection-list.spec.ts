import { TestBed } from '@angular/core/testing';

import { RadioSelectionList, RadioSelectionOption } from './radio-selection-list';

const OPTIONS: RadioSelectionOption[] = [
  { id: 'a', name: 'Alfa', tag: 'Nuevo' },
  { id: 'b', name: 'Beta', disabled: true },
];

describe('RadioSelectionList', () => {
  function setup() {
    const fixture = TestBed.createComponent(RadioSelectionList);
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('dibuja una fila por opción con su estado', () => {
    const { fixture, host } = setup();
    fixture.componentInstance.writeValue('a');
    fixture.detectChanges();
    const cards = host.querySelectorAll('.yep-radio-card');
    expect(cards.length).toBe(2);
    expect(cards[0].classList).toContain('yep-radio-card--selected');
    expect(cards[1].classList).toContain('yep-radio-card--disabled');
    expect(host.querySelector('.yep-radio-card__tag')?.textContent).toContain('Nuevo');
  });

  it('emite valueChange al elegir una opción habilitada', () => {
    const { fixture, host } = setup();
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
    const inputs = host.querySelectorAll<HTMLInputElement>('.yep-radio-card__input');
    inputs[0].dispatchEvent(new Event('change'));
    inputs[1].dispatchEvent(new Event('change'));
    expect(emitted).toEqual(['a']);
  });
});
