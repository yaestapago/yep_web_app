import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { MenuItem } from './menu-item';

@Component({
  imports: [MenuItem],
  template: `
    <button yepMenuItem class="neutral">Configuración</button>
    <button yepMenuItem tone="danger" class="peligro">Eliminar</button>
    <button yepMenuItem class="apagado" disabled>Apagado</button>
    <a yepMenuItem class="enlace" href="/x" aria-disabled="true">Enlace</a>
  `,
})
class Host {}

describe('MenuItem', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const items = fixture.debugElement
      .queryAll(By.directive(MenuItem))
      .map((node) => node.injector.get(MenuItem));
    return { el, items, get: (cls: string) => el.querySelector(`.${cls}`) as HTMLElement };
  }

  it('pone role menuitem, tabindex -1 y type button', () => {
    const { get } = setup();
    const neutral = get('neutral');
    expect(neutral.getAttribute('role')).toBe('menuitem');
    expect(neutral.getAttribute('tabindex')).toBe('-1');
    expect(neutral.getAttribute('type')).toBe('button');
    expect(neutral.classList).toContain('yep-menu__item');
    expect(neutral.classList).not.toContain('yep-menu__item--danger');
    expect(get('enlace').hasAttribute('type')).toBe(false);
  });

  it('tone="danger" añade la clase de texto rojo', () => {
    const { get } = setup();
    expect(get('peligro').classList).toContain('yep-menu__item--danger');
  });

  it('detecta deshabilitado nativo o aria-disabled y enfoca', () => {
    const { items, get } = setup();
    const byClass = (cls: string) => items.find((item) => item.element === get(cls))!;
    expect(byClass('neutral').disabled).toBe(false);
    expect(byClass('apagado').disabled).toBe(true);
    expect(byClass('enlace').disabled).toBe(true);

    const root = get('neutral').parentElement!;
    document.body.appendChild(root);
    byClass('neutral').focus();
    expect(document.activeElement).toBe(get('neutral'));
    root.remove();
  });
});
