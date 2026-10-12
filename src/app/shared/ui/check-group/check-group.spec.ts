import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckGroup } from './check-group';
import { CheckOption } from './check-option';

@Component({
  imports: [CheckGroup, CheckOption],
  template: `
    <yep-check-group
      label="Caja principal"
      [meta]="meta()"
      [count]="count()"
      [checked]="checked()"
      [indeterminate]="indeterminate()"
      [disabled]="disabled()"
      dataCy="grupo"
      (checkedChange)="emitted.push($event)"
    >
      @if (withOptions()) {
        <yep-check-option label="Cuenta directa" meta="Sin llave Bre-B" [checked]="true" />
        <yep-check-option label="0091806394" meta="Llave Bre-B" />
      }
      <button slot="actions" type="button" class="accion">Deseleccionar todo</button>
    </yep-check-group>
  `,
})
class Host {
  readonly meta = signal('****9432 · Ahorros');
  readonly count = signal('2 de 2 llaves');
  readonly checked = signal(false);
  readonly indeterminate = signal(false);
  readonly disabled = signal(false);
  readonly withOptions = signal(true);
  emitted: boolean[] = [];
}

describe('CheckGroup', () => {
  let fixture: ComponentFixture<Host>;

  const host = () => fixture.componentInstance;
  const el = () => fixture.nativeElement as HTMLElement;
  const group = () => el().querySelector('.yep-check-group') as HTMLElement;
  const input = () => el().querySelector('[data-cy="grupo"]') as HTMLInputElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('dibuja etiqueta, meta, contador, acciones y opciones hijas', () => {
    expect(el().querySelector('.yep-check-group__main .yep-check__label')?.textContent).toContain(
      'Caja principal',
    );
    expect(el().querySelector('.yep-check-group__meta')?.textContent).toContain('****9432');
    expect(el().querySelector('.yep-check-group__count')?.textContent).toContain('2 de 2 llaves');
    expect(el().querySelector('.yep-check-group__head .accion')).not.toBeNull();
    const options = el().querySelector('.yep-check-group__options') as HTMLElement;
    expect(options.getAttribute('role')).toBe('group');
    expect(options.getAttribute('aria-labelledby')).toBe(
      el().querySelector('.yep-check-group__main .yep-check__label')?.id,
    );
    expect(options.querySelectorAll('yep-check-option').length).toBe(2);
  });

  it('sin opciones, la rejilla queda vacía y sin contador ni meta si no se pasan', () => {
    host().withOptions.set(false);
    host().count.set('');
    host().meta.set('');
    fixture.detectChanges();
    const options = el().querySelector('.yep-check-group__options') as HTMLElement;
    expect(options.children.length).toBe(0);
    expect(el().querySelector('.yep-check-group__count')).toBeNull();
    expect(el().querySelector('.yep-check-group__meta')).toBeNull();
  });

  it('marcado: fondo primary-soft y casilla con check', () => {
    expect(group().classList).not.toContain('yep-check-group--on');
    host().checked.set(true);
    fixture.detectChanges();
    expect(group().classList).toContain('yep-check-group--on');
    expect(input().checked).toBe(true);
    expect(el().querySelector('.yep-check-group__main .yep-check__box svg')).not.toBeNull();
  });

  it('indeterminado: propiedad nativa y fondo marcado', () => {
    host().indeterminate.set(true);
    fixture.detectChanges();
    expect(input().indeterminate).toBe(true);
    expect(group().classList).toContain('yep-check-group--on');
  });

  it('emite checkedChange con el valor pedido', () => {
    input().click();
    expect(host().emitted).toEqual([true]);
    // Controlado: la casilla no cambia hasta que la página actualiza `checked`.
    expect(input().checked).toBe(false);

    host().checked.set(true);
    fixture.detectChanges();
    input().click();
    expect(host().emitted).toEqual([true, false]);

    host().checked.set(false);
    host().indeterminate.set(true);
    fixture.detectChanges();
    input().click();
    expect(host().emitted).toEqual([true, false, true]);
  });

  it('deshabilitado no emite', () => {
    host().disabled.set(true);
    fixture.detectChanges();
    expect(group().classList).toContain('yep-check-group--disabled');
    expect(input().disabled).toBe(true);
    input().dispatchEvent(new Event('change'));
    expect(host().emitted).toEqual([]);
  });
});
