import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { State } from './state';

@Component({
  imports: [State],
  template: `
    <yep-state kind="empty" title="Sin solicitudes" description="Aparecerán aquí.">
      <svg slot="icon" class="custom-icon"></svg>
      <button slot="action" type="button" class="action">Invitar</button>
    </yep-state>
  `,
})
class HostComponent {}

describe('State', () => {
  async function create(inputs: Record<string, unknown>) {
    await TestBed.configureTestingModule({ imports: [State] }).compileComponents();
    const fixture = TestBed.createComponent(State);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('loading muestra 3 barras de esqueleto por defecto, sin spinner', async () => {
    const { fixture, el } = await create({ kind: 'loading' });
    const state = el.querySelector('.yep-state--loading')!;

    expect(fixture.componentInstance).toBeTruthy();
    expect(state.getAttribute('role')).toBe('status');
    expect(state.getAttribute('aria-busy')).toBe('true');
    expect(state.querySelectorAll('.yep-state__skeleton').length).toBe(3);
    expect(el.querySelector('.yep-state__sr-only')?.textContent?.trim()).toBe('Cargando');
    expect(el.querySelector('yep-icon-tile')).toBeNull();
  });

  it('loading respeta rows y usa el título como texto accesible', async () => {
    const { el } = await create({ kind: 'loading', rows: 5, title: 'Cargando pagos' });
    expect(el.querySelectorAll('.yep-state__skeleton').length).toBe(5);
    expect(el.querySelector('.yep-state__sr-only')?.textContent?.trim()).toBe('Cargando pagos');
  });

  it('empty muestra icono por defecto, título y descripción', async () => {
    const { el } = await create({ kind: 'empty', title: 'Sin pagos', description: 'Aún no hay pagos.' });
    const state = el.querySelector('.yep-state')!;

    expect(state.classList).toContain('yep-state--empty');
    expect(state.hasAttribute('role')).toBe(false);
    expect(el.querySelector('yep-icon-tile .yep-icon-tile--48 svg')).not.toBeNull();
    expect(el.querySelector('.yep-state__title')?.textContent?.trim()).toBe('Sin pagos');
    expect(el.querySelector('.yep-state__description')?.textContent?.trim()).toBe('Aún no hay pagos.');
    expect(el.hasAttribute('title')).toBe(false);
  });

  it('error usa role=alert', async () => {
    const { el } = await create({ kind: 'error', title: 'No pudimos cargar' });
    const state = el.querySelector('.yep-state')!;
    expect(state.classList).toContain('yep-state--error');
    expect(state.getAttribute('role')).toBe('alert');
    expect(el.querySelector('.yep-state__description')).toBeNull();
  });

  it('proyecta icono propio y acción', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('yep-icon-tile svg.custom-icon')).not.toBeNull();
    expect(el.querySelectorAll('yep-icon-tile svg').length).toBe(1);
    expect(el.querySelector('.yep-state__action .action')).not.toBeNull();
  });
});
