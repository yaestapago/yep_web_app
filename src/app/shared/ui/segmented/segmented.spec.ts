import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Segmented, type SegmentedOption } from './segmented';

@Component({
  imports: [Segmented],
  template: `
    <yep-segmented
      aria-label="Estado"
      [options]="options"
      [(value)]="value"
      (valueChange)="changes.push($event)"
    />
  `,
})
class Host {
  readonly options: SegmentedOption[] = [
    { value: 'reported', label: 'Pago reportado', count: 3 },
    { value: 'pending', label: 'Pendiente', count: 0 },
    { value: 'paid', label: 'Pagada' },
  ];
  readonly value = signal('reported');
  readonly changes: string[] = [];
}

describe('Segmented', () => {
  let fixture: ComponentFixture<Host>;

  const el = () => fixture.nativeElement as HTMLElement;
  const tabs = () => Array.from(el().querySelectorAll<HTMLButtonElement>('button[role="tab"]'));
  const host = () => fixture.componentInstance;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('renderiza un tablist con una pestaña por opción y la activa marcada', () => {
    const list = el().querySelector('yep-segmented')!;
    expect(list.getAttribute('role')).toBe('tablist');
    expect(list.getAttribute('aria-label')).toBe('Estado');
    expect(tabs().length).toBe(3);
    expect(tabs()[0].classList).toContain('yep-segmented__option--active');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs()[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it('muestra el conteo cuando existe, también si es 0', () => {
    expect(tabs()[0].querySelector('.yep-segmented__count')?.textContent?.trim()).toBe('3');
    expect(tabs()[1].querySelector('.yep-segmented__count')?.textContent?.trim()).toBe('0');
    expect(tabs()[2].querySelector('.yep-segmented__count')).toBeNull();
  });

  it('emite valueChange al pulsar otra opción y actualiza con two-way binding', () => {
    tabs()[2].click();
    fixture.detectChanges();
    expect(host().changes).toEqual(['paid']);
    expect(host().value()).toBe('paid');
    expect(tabs()[2].classList).toContain('yep-segmented__option--active');
  });

  it('no emite al pulsar la opción activa', () => {
    tabs()[0].click();
    expect(host().changes).toEqual([]);
  });

  it('las flechas, Inicio y Fin mueven la selección', () => {
    const key = (target: HTMLElement, k: string) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

    key(tabs()[0], 'ArrowRight');
    fixture.detectChanges();
    expect(host().value()).toBe('pending');

    key(tabs()[1], 'End');
    fixture.detectChanges();
    expect(host().value()).toBe('paid');

    key(tabs()[2], 'ArrowRight');
    fixture.detectChanges();
    expect(host().value()).toBe('reported');

    key(tabs()[0], 'ArrowLeft');
    fixture.detectChanges();
    expect(host().value()).toBe('paid');

    key(tabs()[2], 'Home');
    fixture.detectChanges();
    expect(host().value()).toBe('reported');
    expect(host().changes).toEqual(['pending', 'paid', 'reported', 'paid', 'reported']);
  });

  it('si ninguna opción está activa, la primera recibe el foco con Tab', () => {
    host().value.set('otra');
    fixture.detectChanges();
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs().some((t) => t.getAttribute('aria-selected') === 'true')).toBe(false);
  });
});
