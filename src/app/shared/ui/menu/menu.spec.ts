import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Menu } from './menu';
import { MenuItem } from './menu-item';

@Component({
  imports: [Menu, MenuItem],
  template: `
    <button type="button" class="fuera">Fuera</button>
    <yep-menu
      [label]="label()"
      [size]="size()"
      [align]="align()"
      [disabled]="disabled()"
      dataCy="mas"
      (openChange)="changes.push($event)"
    >
      <button yepMenuItem class="ver" (click)="picked.push('ver')">Ver</button>
      <button yepMenuItem class="bloqueado" disabled>Bloqueado</button>
      <button yepMenuItem class="config" (click)="picked.push('config')">Configuración</button>
      <button yepMenuItem tone="danger" class="eliminar" (click)="picked.push('eliminar')">
        Eliminar
      </button>
    </yep-menu>
  `,
})
class Host {
  readonly label = signal('Más acciones');
  readonly size = signal<'sm' | 'md'>('sm');
  readonly align = signal<'start' | 'end'>('end');
  readonly disabled = signal(false);
  changes: boolean[] = [];
  picked: string[] = [];
}

describe('Menu', () => {
  let fixture: ComponentFixture<Host>;

  const host = () => fixture.componentInstance;
  const el = () => fixture.nativeElement as HTMLElement;
  const trigger = () => el().querySelector('.yep-menu__trigger') as HTMLButtonElement;
  const panel = () => el().querySelector('[role="menu"]') as HTMLElement;
  const item = (cls: string) => el().querySelector(`.${cls}`) as HTMLButtonElement;
  const key = (target: HTMLElement, k: string) => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };
  const isOpen = () => !panel().hidden;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
  });

  it('disparador accesible: aria-haspopup, aria-expanded, aria-label y title', () => {
    expect(trigger().type).toBe('button');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-label')).toBe('Más acciones');
    expect(trigger().title).toBe('Más acciones');
    expect(trigger().getAttribute('data-cy')).toBe('mas');
    expect(trigger().querySelector('svg')).not.toBeNull();
    expect(panel().getAttribute('aria-labelledby')).toBe(trigger().id);
    expect(isOpen()).toBe(false);
  });

  it('aplica el tamaño md', () => {
    host().size.set('md');
    fixture.detectChanges();
    expect(trigger().classList).toContain('yep-menu__trigger--md');
  });

  it('clic abre, enfoca el primer ítem y emite openChange', () => {
    trigger().click();
    fixture.detectChanges();
    expect(isOpen()).toBe(true);
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-controls')).toBe(panel().id);
    expect(document.activeElement).toBe(item('ver'));
    expect(host().changes).toEqual([true]);

    trigger().click();
    fixture.detectChanges();
    expect(isOpen()).toBe(false);
    expect(host().changes).toEqual([true, false]);
  });

  it('flechas circulan saltando deshabilitados; Inicio y Fin', () => {
    trigger().click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(item('ver'));

    expect(key(item('ver'), 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(item('config'));
    key(item('config'), 'ArrowDown');
    expect(document.activeElement).toBe(item('eliminar'));
    key(item('eliminar'), 'ArrowDown');
    expect(document.activeElement).toBe(item('ver'));
    key(item('ver'), 'ArrowUp');
    expect(document.activeElement).toBe(item('eliminar'));
    key(item('eliminar'), 'Home');
    expect(document.activeElement).toBe(item('ver'));
    key(item('ver'), 'End');
    expect(document.activeElement).toBe(item('eliminar'));
  });

  it('↓ y ↑ en el disparador abren en el primer o el último ítem', () => {
    trigger().focus();
    key(trigger(), 'ArrowDown');
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(item('ver'));

    key(item('ver'), 'Escape');
    key(trigger(), 'ArrowUp');
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(item('eliminar'));
  });

  it('Escape cierra, devuelve el foco al disparador y no se propaga', () => {
    const outer: string[] = [];
    document.addEventListener('keydown', () => outer.push('doc'), { once: true });
    trigger().click();
    fixture.detectChanges();
    const event = key(item('ver'), 'Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(outer).toEqual([]);
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
  });

  it('Tab cierra sin mover el foco al disparador', () => {
    trigger().click();
    fixture.detectChanges();
    key(item('ver'), 'Tab');
    expect(isOpen()).toBe(false);
  });

  it('elegir un ítem ejecuta su acción, cierra y devuelve el foco', () => {
    trigger().click();
    fixture.detectChanges();
    item('config').click();
    fixture.detectChanges();
    expect(host().picked).toEqual(['config']);
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
  });

  it('clic fuera cierra; clic dentro del panel fuera de un ítem no', () => {
    trigger().click();
    fixture.detectChanges();
    panel().click();
    fixture.detectChanges();
    expect(isOpen()).toBe(true);

    (el().querySelector('.fuera') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(isOpen()).toBe(false);
  });

  it('deshabilitado no abre', () => {
    host().disabled.set(true);
    fixture.detectChanges();
    expect(trigger().disabled).toBe(true);
    key(trigger(), 'ArrowDown');
    expect(isOpen()).toBe(false);
  });

  it('no se sale de la ventana: se ajusta a los márgenes', () => {
    const triggerRect = { top: 100, bottom: 132, left: 4, right: 36, width: 32, height: 32 };
    vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue(triggerRect as DOMRect);
    vi.spyOn(panel(), 'offsetWidth', 'get').mockReturnValue(200);
    vi.spyOn(panel(), 'offsetHeight', 'get').mockReturnValue(120);

    // align="end" con el disparador pegado a la izquierda: se corre al margen de 8 px.
    trigger().click();
    fixture.detectChanges();
    expect(panel().style.left).toBe('8px');
    expect(panel().style.top).toBe('136px');
  });

  it('se abre hacia arriba si no cabe abajo', () => {
    const bottom = window.innerHeight - 10;
    const triggerRect = { top: bottom - 32, bottom, left: 300, right: 332, width: 32, height: 32 };
    vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue(triggerRect as DOMRect);
    vi.spyOn(panel(), 'offsetWidth', 'get').mockReturnValue(200);
    vi.spyOn(panel(), 'offsetHeight', 'get').mockReturnValue(120);

    trigger().click();
    fixture.detectChanges();
    expect(panel().style.top).toBe(`${bottom - 32 - 4 - 120}px`);
  });
});
