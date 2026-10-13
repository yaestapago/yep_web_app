import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CardSection } from './card-section';

@Component({
  imports: [CardSection],
  template: `
    <div>
      <yep-card-section title="Conexión"><p class="first">Uno</p></yep-card-section>
      <yep-card-section><p class="second">Dos</p></yep-card-section>
    </div>
  `,
})
class HostComponent {}

describe('CardSection', () => {
  it('creates and renders the title', async () => {
    await TestBed.configureTestingModule({ imports: [CardSection] }).compileComponents();
    const fixture = TestBed.createComponent(CardSection);
    fixture.componentRef.setInput('title', 'Mensajes');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance).toBeTruthy();
    expect(el.querySelector('h3.yep-card-section__title')?.textContent?.trim()).toBe('Mensajes');
    expect(el.hasAttribute('title')).toBe(false);
  });

  it('omits the title when empty and projects content', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const sections = (fixture.nativeElement as HTMLElement).querySelectorAll('yep-card-section');

    expect(sections.length).toBe(2);
    expect(sections[0].querySelector('.yep-card-section__title')).toBeTruthy();
    expect(sections[0].querySelector('.first')).toBeTruthy();
    expect(sections[1].querySelector('.yep-card-section__title')).toBeNull();
    expect(sections[1].querySelector('.second')).toBeTruthy();
  });
});
