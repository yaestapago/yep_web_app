import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ZairaAvatar } from './zaira-avatar';

@Component({
  imports: [ZairaAvatar],
  template: `<app-zaira-avatar [size]="44" [online]="true" /><app-zaira-avatar [size]="28" />`,
})
class Host {}

describe('ZairaAvatar', () => {
  it('cada avatar usa su propio clipPath y respeta el tamaño', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const [big, small] = Array.from(
      fixture.nativeElement.querySelectorAll('app-zaira-avatar'),
    ) as HTMLElement[];

    const bigId = big.querySelector('clipPath')!.getAttribute('id');
    const smallId = small.querySelector('clipPath')!.getAttribute('id');
    expect(bigId).not.toBe(smallId);
    expect(big.querySelector('g')!.getAttribute('clip-path')).toBe(`url(#${bigId})`);

    expect(big.style.width).toBe('44px');
    expect(small.style.height).toBe('28px');
    expect(big.getAttribute('aria-hidden')).toBe('true');
  });

  it('el punto de "en línea" solo aparece cuando se pide', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const [big, small] = Array.from(
      fixture.nativeElement.querySelectorAll('app-zaira-avatar'),
    ) as HTMLElement[];
    expect(big.querySelector('.zaira__online')).not.toBeNull();
    expect(small.querySelector('.zaira__online')).toBeNull();
  });
});
