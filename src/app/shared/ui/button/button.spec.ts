import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Button, type ButtonSize, type ButtonTone, type ButtonVariant } from './button';

@Component({
  imports: [Button],
  template: `
    <yep-button
      [variant]="variant()"
      [size]="size()"
      [tone]="tone()"
      [disabled]="disabled()"
      [loading]="loading()"
      [fullWidth]="fullWidth()"
      type="submit"
      data-cy="host-button"
      (clicked)="clicks = clicks + 1"
    >
      <svg class="icon"></svg>
      Guardar
    </yep-button>
  `,
})
class Host {
  readonly variant = signal<ButtonVariant>('primary');
  readonly size = signal<ButtonSize>('md');
  readonly tone = signal<ButtonTone>('neutral');
  readonly disabled = signal(false);
  readonly loading = signal(false);
  readonly fullWidth = signal(false);
  clicks = 0;
}

describe('Button', () => {
  let fixture: ComponentFixture<Host>;

  const host = () => fixture.componentInstance;
  const button = () =>
    (fixture.nativeElement as HTMLElement).querySelector('button.yep-button') as HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('renderiza un botón primario md por defecto con el contenido proyectado', () => {
    expect(button()).not.toBeNull();
    expect(button().type).toBe('submit');
    expect(button().classList).toContain('yep-button--primary');
    expect(button().classList).toContain('yep-button--md');
    expect(button().textContent).toContain('Guardar');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('yep-button')?.getAttribute('data-cy'),
    ).toBe('host-button');
  });

  it.each<ButtonVariant>(['secondary', 'ghost', 'danger'])('aplica la variante %s', (variant) => {
    host().variant.set(variant);
    fixture.detectChanges();
    expect(button().classList).toContain(`yep-button--${variant}`);
    expect(button().classList).not.toContain('yep-button--primary');
  });

  it.each<ButtonSize>(['sm', 'lg'])('aplica el tamaño %s', (size) => {
    host().size.set(size);
    fixture.detectChanges();
    expect(button().classList).toContain(`yep-button--${size}`);
    expect(button().classList).not.toContain('yep-button--md');
  });

  it('tone neutral no añade clases de tono', () => {
    host().variant.set('secondary');
    fixture.detectChanges();
    expect(button().className).not.toContain('yep-button--tone-');
  });

  it.each<[ButtonVariant, ButtonTone]>([
    ['secondary', 'danger'],
    ['ghost', 'danger'],
    ['secondary', 'on-brand'],
    ['ghost', 'on-brand'],
  ])('%s admite tone %s', (variant, tone) => {
    host().variant.set(variant);
    host().tone.set(tone);
    fixture.detectChanges();
    expect(button().classList).toContain(`yep-button--tone-${tone}`);
  });

  it.each<ButtonVariant>(['primary', 'danger'])('%s ignora el tono', (variant) => {
    host().variant.set(variant);
    host().tone.set('danger');
    fixture.detectChanges();
    expect(button().className).not.toContain('yep-button--tone-');
  });

  it('marca fullWidth en el host y en el botón', () => {
    host().fullWidth.set(true);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector('yep-button') as HTMLElement;
    expect(el.classList).toContain('yep-button-host--full');
    expect(button().classList).toContain('yep-button--full');
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

  it('loading deshabilita, muestra el spinner y marca aria-busy', () => {
    host().loading.set(true);
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(button().classList).toContain('yep-button--loading');
    expect(button().querySelector('.yep-button__loader')).not.toBeNull();
    button().click();
    expect(host().clicks).toBe(0);
  });
});
