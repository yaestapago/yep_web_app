import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IconTile, type IconTileSize } from './icon-tile';

@Component({
  imports: [IconTile],
  template: `
    <yep-icon-tile [size]="size()" [active]="active()"><svg class="icon"></svg></yep-icon-tile>
  `,
})
class Host {
  readonly size = signal<IconTileSize>(36);
  readonly active = signal(false);
}

describe('IconTile', () => {
  let fixture: ComponentFixture<Host>;

  const tile = () =>
    (fixture.nativeElement as HTMLElement).querySelector('.yep-icon-tile') as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('crea un contenedor de 36 px inactivo con el icono proyectado', () => {
    expect(tile()).not.toBeNull();
    expect(tile().classList).not.toContain('yep-icon-tile--48');
    expect(tile().classList).not.toContain('yep-icon-tile--active');
    expect(tile().querySelector('svg.icon')).not.toBeNull();
  });

  it('aplica el tamaño 48', () => {
    fixture.componentInstance.size.set(48);
    fixture.detectChanges();
    expect(tile().classList).toContain('yep-icon-tile--48');
  });

  it('aplica el estado activo', () => {
    fixture.componentInstance.active.set(true);
    fixture.detectChanges();
    expect(tile().classList).toContain('yep-icon-tile--active');
  });
});
