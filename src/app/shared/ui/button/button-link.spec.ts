import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';

import { type ButtonSize, type ButtonTone, type ButtonVariant } from './button';
import { ButtonLink } from './button-link';

@Component({
  imports: [ButtonLink, RouterLink],
  template: `
    <a
      yepButton
      class="extra"
      data-cy="host-link"
      [variant]="variant()"
      [size]="size()"
      [tone]="tone()"
      [fullWidth]="fullWidth()"
      routerLink="/businesses"
    >
      <svg class="icon"></svg>
      Ir a negocios
    </a>
    <a yepButton class="external" href="https://yaestapago.co" target="_blank" rel="noreferrer"
      >Blog</a
    >
  `,
})
class Host {
  readonly variant = signal<ButtonVariant>('primary');
  readonly size = signal<ButtonSize>('md');
  readonly tone = signal<ButtonTone>('neutral');
  readonly fullWidth = signal(false);
}

describe('ButtonLink (a[yepButton])', () => {
  let fixture: ComponentFixture<Host>;

  const host = () => fixture.componentInstance;
  const link = () =>
    (fixture.nativeElement as HTMLElement).querySelector('a.extra') as HTMLAnchorElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('pone la piel del botón primario md sobre el propio <a>, sin envolverlo', () => {
    expect(link().classList).toContain('yep-button');
    expect(link().classList).toContain('yep-button--primary');
    expect(link().classList).toContain('yep-button--md');
    expect(link().classList).toContain('extra');
    expect(link().getAttribute('data-cy')).toBe('host-link');
    expect(link().querySelector('svg.icon')).not.toBeNull();
    expect(link().textContent).toContain('Ir a negocios');
    expect(link().querySelector('button')).toBeNull();
  });

  it('conserva routerLink y href de la página', () => {
    expect(link().getAttribute('href')).toBe('/businesses');
    const external = (fixture.nativeElement as HTMLElement).querySelector('a.external')!;
    expect(external.getAttribute('href')).toBe('https://yaestapago.co');
    expect(external.getAttribute('target')).toBe('_blank');
    expect(external.classList).toContain('yep-button--primary');
  });

  it.each<ButtonVariant>(['secondary', 'ghost', 'danger'])('aplica la variante %s', (variant) => {
    host().variant.set(variant);
    fixture.detectChanges();
    expect(link().classList).toContain(`yep-button--${variant}`);
    expect(link().classList).not.toContain('yep-button--primary');
  });

  it.each<ButtonSize>(['sm', 'lg'])('aplica el tamaño %s', (size) => {
    host().size.set(size);
    fixture.detectChanges();
    expect(link().classList).toContain(`yep-button--${size}`);
    expect(link().classList).not.toContain('yep-button--md');
  });

  it.each<[ButtonVariant, ButtonTone, string | null]>([
    ['secondary', 'on-brand', 'on-brand'],
    ['ghost', 'danger', 'danger'],
    ['primary', 'ink', 'ink'],
    ['secondary', 'ink', 'ink'],
    ['primary', 'on-brand', null],
    ['danger', 'ink', null],
  ])('%s con tone %s', (variant, tone, expected) => {
    host().variant.set(variant);
    host().tone.set(tone);
    fixture.detectChanges();
    const toneClasses = Array.from(link().classList).filter((c) =>
      c.startsWith('yep-button--tone-'),
    );
    expect(toneClasses).toEqual(expected ? [`yep-button--tone-${expected}`] : []);
  });

  it('fullWidth ocupa todo el ancho', () => {
    host().fullWidth.set(true);
    fixture.detectChanges();
    expect(link().classList).toContain('yep-button--full');
  });
});
