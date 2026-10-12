import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IconButton, type IconButtonAction, type IconButtonTone } from './icon-button';

@Component({
  imports: [IconButton],
  template: `
    <yep-icon-button
      [action]="action()"
      [size]="size()"
      [tone]="tone()"
      [label]="label()"
      [disabled]="disabled()"
      [loading]="loading()"
      (clicked)="clicks = clicks + 1"
    />
  `,
})
class Host {
  readonly action = signal<IconButtonAction>('edit');
  readonly size = signal<'sm' | 'md' | 'lg'>('sm');
  readonly tone = signal<IconButtonTone>('neutral');
  readonly label = signal('');
  readonly disabled = signal(false);
  readonly loading = signal(false);
  clicks = 0;
}

describe('IconButton', () => {
  let fixture: ComponentFixture<Host>;

  const host = () => fixture.componentInstance;
  const button = () =>
    (fixture.nativeElement as HTMLElement).querySelector(
      'button.yep-icon-button',
    ) as HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('renderiza un botón sm neutral con aria-label y title del preset', () => {
    expect(button().type).toBe('button');
    expect(button().classList).toContain('yep-icon-button--sm');
    expect(button().classList).not.toContain('yep-icon-button--danger');
    expect(button().getAttribute('aria-label')).toBe('Editar');
    expect(button().title).toBe('Editar');
    expect(button().querySelector('svg')).not.toBeNull();
  });

  it('label sobrescribe aria-label y title', () => {
    host().label.set('Quitar');
    fixture.detectChanges();
    expect(button().getAttribute('aria-label')).toBe('Quitar');
    expect(button().title).toBe('Quitar');
  });

  it.each<'md' | 'lg'>(['md', 'lg'])('aplica el tamaño %s', (size) => {
    host().size.set(size);
    fixture.detectChanges();
    expect(button().classList).toContain(`yep-icon-button--${size}`);
    expect(button().classList).not.toContain('yep-icon-button--sm');
  });

  it('tone="danger" pinta el icono en rojo', () => {
    host().tone.set('danger');
    fixture.detectChanges();
    expect(button().classList).toContain('yep-icon-button--danger');
  });

  it('la acción delete es danger por preset', () => {
    host().action.set('delete');
    fixture.detectChanges();
    expect(button().classList).toContain('yep-icon-button--danger');
    expect(button().getAttribute('aria-label')).toBe('Eliminar');
  });

  it.each<IconButtonAction>(['activate', 'deactivate'])('%s es neutral', (action) => {
    host().action.set(action);
    fixture.detectChanges();
    expect(button().classList).not.toContain('yep-icon-button--danger');
  });

  it('emite clicked al pulsar', () => {
    button().click();
    expect(host().clicks).toBe(1);
  });

  it('no emite clicked si está deshabilitado', () => {
    host().disabled.set(true);
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
    button().click();
    expect(host().clicks).toBe(0);
  });

  it('loading reemplaza el icono por el spinner y deshabilita', () => {
    host().loading.set(true);
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(button().querySelector('.yep-icon-button__loader')).not.toBeNull();
    expect(button().querySelector('svg')).toBeNull();
    button().click();
    expect(host().clicks).toBe(0);
  });
});
