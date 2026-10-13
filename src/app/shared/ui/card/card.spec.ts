import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Card } from './card';

@Component({
  imports: [Card],
  template: `
    <yep-card title="Datos del negocio" subtitle="Información general">
      <svg slot="icon" class="icon"></svg>
      <button slot="actions" type="button" class="action">Editar</button>
      <p class="content">Contenido</p>
      <div slot="footer" class="foot">Pie</div>
    </yep-card>
  `,
})
class HostComponent {}

describe('Card', () => {
  async function create(inputs: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({ imports: [Card] }).compileComponents();
    const fixture = TestBed.createComponent(Card);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('creates with default padding and tone', async () => {
    const { fixture, el } = await create();
    const card = el.querySelector('.yep-card')!;

    expect(fixture.componentInstance).toBeTruthy();
    expect(card.classList.contains('yep-card--flush')).toBe(false);
    expect(card.classList.contains('yep-card--brand')).toBe(false);
    expect(el.querySelector('.yep-card__heading')).toBeNull();
    expect(card.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('renders title and subtitle and labels the section with the title', async () => {
    const { el } = await create({ title: 'Plan', subtitle: 'Tu suscripción' });
    const title = el.querySelector('h2.yep-card__title')!;

    expect(title.textContent?.trim()).toBe('Plan');
    expect(el.querySelector('.yep-card__subtitle')?.textContent?.trim()).toBe('Tu suscripción');
    expect(el.querySelector('.yep-card')?.getAttribute('aria-labelledby')).toBe(title.id);
    expect(el.hasAttribute('title')).toBe(false);
  });

  it('applies padding none and brand tone classes', async () => {
    const { el } = await create({ padding: 'none', tone: 'brand' });
    const card = el.querySelector('.yep-card')!;

    expect(card.classList.contains('yep-card--flush')).toBe(true);
    expect(card.classList.contains('yep-card--brand')).toBe(true);
  });

  it('projects icon, actions, default content and footer', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.yep-card__header .yep-card__icon .icon')).toBeTruthy();
    expect(el.querySelector('.yep-card__header .yep-card__actions .action')).toBeTruthy();
    expect(el.querySelector('.yep-card__body .content')).toBeTruthy();
    expect(el.querySelector('.yep-card__body .foot')).toBeNull();
    expect(el.querySelector('.yep-card__footer .foot')).toBeTruthy();
  });
});
