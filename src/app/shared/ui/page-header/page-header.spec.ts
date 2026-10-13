import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PageHeader } from './page-header';

@Component({
  imports: [PageHeader],
  template: `
    <yep-page-header title="Panadería La Espiga" subtitle="Bucaramanga" eyebrow="Negocios">
      <a slot="back" href="/business" class="back-link">Volver</a>
      <span slot="leading" class="avatar">LE</span>
      <span slot="meta" class="chip">Propietario</span>
      <button slot="actions" type="button" class="action">Editar</button>
    </yep-page-header>
  `,
})
class HostComponent {}

describe('PageHeader', () => {
  it('renders the title as h1 and omits optional parts by default', async () => {
    await TestBed.configureTestingModule({ imports: [PageHeader] }).compileComponents();
    const fixture = TestBed.createComponent(PageHeader);
    fixture.componentRef.setInput('title', 'Negocios');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance).toBeTruthy();
    expect(el.querySelector('h1.yep-page-header__title')?.textContent?.trim()).toBe('Negocios');
    expect(el.querySelector('.yep-page-header__subtitle')).toBeNull();
    expect(el.querySelector('.yep-page-header__eyebrow')).toBeNull();
    expect(el.hasAttribute('title')).toBe(false);
  });

  it('renders subtitle and eyebrow', async () => {
    await TestBed.configureTestingModule({ imports: [PageHeader] }).compileComponents();
    const fixture = TestBed.createComponent(PageHeader);
    fixture.componentRef.setInput('title', 'Datos');
    fixture.componentRef.setInput('subtitle', 'Información general');
    fixture.componentRef.setInput('eyebrow', 'La Espiga');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.yep-page-header__subtitle')?.textContent?.trim()).toBe('Información general');
    expect(el.querySelector('.yep-page-header__eyebrow')?.textContent?.trim()).toBe('La Espiga');
  });

  it('projects back, leading, meta and actions slots into their places', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.yep-page-header__back .back-link')).toBeTruthy();
    expect(el.querySelector('.yep-page-header__leading .avatar')).toBeTruthy();
    expect(el.querySelector('.yep-page-header__title-row .yep-page-header__meta .chip')).toBeTruthy();
    expect(el.querySelector('.yep-page-header__actions .action')).toBeTruthy();
    expect(el.querySelector('yep-page-header')?.hasAttribute('title')).toBe(false);
  });
});
