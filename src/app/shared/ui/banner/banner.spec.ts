import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Button } from '../button/button';
import { ButtonLink } from '../button/button-link';
import { IconTile } from '../icon-tile/icon-tile';
import { Banner } from './banner';

@Component({
  imports: [Banner, Button],
  template: `
    <yep-banner title="Un panel más claro">
      <yep-button slot="actions" class="primary" (clicked)="opened = opened + 1"
        >Ir al panel</yep-button
      >
      <yep-button slot="actions" class="secondary" variant="secondary" tone="on-brand"
        >Ver novedades</yep-button
      >
      <p class="stray">Fuera del slot</p>
    </yep-banner>
  `,
})
class HostComponent {
  opened = 0;
}

@Component({
  imports: [Banner, ButtonLink, IconTile],
  template: `
    <yep-banner tone="lime" size="compact" title="Invita a tu equipo" text="Comparte el código.">
      <yep-icon-tile slot="icon" class="tile" [size]="48"><svg></svg></yep-icon-tile>
      <a slot="actions" yepButton tone="ink" class="link" href="/employees">Ir a Empleados</a>
    </yep-banner>
  `,
})
class CompactHostComponent {}

describe('Banner', () => {
  async function create(inputs: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({ imports: [Banner] }).compileComponents();
    const fixture = TestBed.createComponent(Banner);
    fixture.componentRef.setInput('title', 'Un panel de pagos más claro');
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('creates with the ink tone and only the title', async () => {
    const { fixture, el } = await create();
    const banner = el.querySelector('section.yep-banner')!;
    const title = el.querySelector('h2.yep-banner__title')!;

    expect(fixture.componentInstance).toBeTruthy();
    expect(banner.classList.contains('yep-banner--ink')).toBe(true);
    expect(banner.classList.contains('yep-banner--lime')).toBe(false);
    expect(banner.classList.contains('yep-banner--paper')).toBe(false);
    expect(title.textContent?.trim()).toBe('Un panel de pagos más claro');
    expect(banner.getAttribute('aria-labelledby')).toBe(title.id);
    expect(el.hasAttribute('title')).toBe(false);
    expect(el.querySelector('.yep-banner__eyebrow')).toBeNull();
    expect(el.querySelector('.yep-banner__text')).toBeNull();
    expect(el.querySelector('.yep-banner__art')).toBeNull();
  });

  it('draws the brand diagonal as decoration', async () => {
    const { el } = await create();
    const diagonal = el.querySelector('svg.yep-banner__diagonal')!;

    expect(diagonal).toBeTruthy();
    expect(diagonal.getAttribute('aria-hidden')).toBe('true');
    expect(diagonal.querySelectorAll('polygon').length).toBe(2);
  });

  it('renders eyebrow and text', async () => {
    const { el } = await create({ eyebrow: 'Novedad', text: 'Todo en un solo tablero.' });

    expect(el.querySelector('.yep-banner__eyebrow')?.textContent?.trim()).toBe('Novedad');
    expect(el.querySelector('p.yep-banner__text')?.textContent?.trim()).toBe(
      'Todo en un solo tablero.',
    );
  });

  it('applies the lime and paper tones', async () => {
    const { fixture, el } = await create({ tone: 'lime' });
    const banner = el.querySelector('.yep-banner')!;
    expect(banner.classList.contains('yep-banner--lime')).toBe(true);
    expect(banner.classList.contains('yep-banner--ink')).toBe(false);

    fixture.componentRef.setInput('tone', 'paper');
    fixture.detectChanges();
    expect(banner.classList.contains('yep-banner--paper')).toBe(true);
    expect(banner.classList.contains('yep-banner--lime')).toBe(false);
  });

  it('shows the illustration as a decorative image', async () => {
    const { el } = await create({ imageSrc: 'illustrations/home-panel.svg' });
    const img = el.querySelector('.yep-banner__art img') as HTMLImageElement;

    expect(el.querySelector('.yep-banner')?.classList.contains('yep-banner--with-image')).toBe(
      true,
    );
    expect(img.getAttribute('src')).toBe('illustrations/home-panel.svg');
    expect(img.getAttribute('alt')).toBe('');
  });

  it('projects only [slot=actions] and lets the buttons emit', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const actions = el.querySelector('.yep-banner__actions')!;

    expect(actions.querySelector('.primary')).toBeTruthy();
    expect(actions.querySelector('.secondary .yep-button--tone-on-brand')).toBeTruthy();
    expect(el.querySelector('.stray')).toBeNull();

    (actions.querySelector('.primary button') as HTMLButtonElement).click();
    expect(fixture.componentInstance.opened).toBe(1);
  });

  it('is md by default and has no icon', async () => {
    const { el } = await create();

    expect(el.querySelector('.yep-banner')?.classList.contains('yep-banner--compact')).toBe(false);
    expect(el.querySelector('.yep-banner__icon')?.childElementCount).toBe(0);
  });

  it('compact size projects the icon above the title and link actions', async () => {
    await TestBed.configureTestingModule({ imports: [CompactHostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(CompactHostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const banner = el.querySelector('.yep-banner')!;
    const icon = el.querySelector('.yep-banner__icon')!;
    const title = el.querySelector('.yep-banner__title')!;

    expect(banner.classList).toContain('yep-banner--compact');
    expect(banner.classList).toContain('yep-banner--lime');
    expect(icon.querySelector('yep-icon-tile.tile')).toBeTruthy();
    expect(icon.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const link = el.querySelector('.yep-banner__actions a.link')!;
    expect(link.classList).toContain('yep-button--tone-ink');
    expect(link.getAttribute('href')).toBe('/employees');
  });
});
