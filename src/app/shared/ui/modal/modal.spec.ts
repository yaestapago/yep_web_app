import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Modal } from './modal';

@Component({
  imports: [Modal],
  template: `
    <yep-modal
      [open]="open()"
      [title]="title()"
      subtitle="Hoy"
      [size]="size()"
      [loading]="loading()"
      [dismissOnBackdrop]="dismissOnBackdrop()"
      (closeRequested)="closes = closes + 1"
    >
      <p class="content">Cuerpo</p>
      <ng-container modalFooter>
        <button type="button" class="action">Aceptar</button>
      </ng-container>
    </yep-modal>
  `,
})
class HostComponent {
  readonly open = signal(true);
  readonly title = signal('Detalle del pago');
  readonly size = signal<'sm' | 'md' | 'lg'>('md');
  readonly loading = signal(false);
  readonly dismissOnBackdrop = signal(true);
  closes = 0;
}

describe('Modal', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, host: fixture.componentInstance, el };
  }

  function pressEscape(el: HTMLElement) {
    el.querySelector('.yep-modal__backdrop')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
  }

  it('no dibuja nada cerrado', () => {
    const { fixture, host, el } = setup();
    host.open.set(false);
    fixture.detectChanges();
    expect(el.querySelector('.yep-modal__backdrop')).toBeNull();
  });

  it('dibuja diálogo, asa, cabecera, cuerpo y pie al abrir', () => {
    const { el } = setup();
    const dialog = el.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Detalle del pago');
    expect(dialog.classList).toContain('yep-modal__dialog--md');
    expect(el.querySelector('.yep-modal__handle')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.yep-modal__title')?.textContent).toContain('Detalle del pago');
    expect(el.querySelector('.yep-modal__subtitle')?.textContent).toContain('Hoy');
    expect(el.querySelector('.yep-modal__body .content')).toBeTruthy();
    expect(el.querySelector('.yep-modal__footer .action')).toBeTruthy();
  });

  it.each(['sm', 'lg'] as const)('aplica el tamaño %s', (size) => {
    const { fixture, host, el } = setup();
    host.size.set(size);
    fixture.detectChanges();
    expect(el.querySelector('.yep-modal__dialog')?.classList).toContain(
      `yep-modal__dialog--${size}`,
    );
  });

  it('bloquea el scroll del body mientras está abierto', () => {
    const { fixture, host } = setup();
    expect(document.body.style.overflow).toBe('hidden');
    host.open.set(false);
    fixture.detectChanges();
    expect(document.body.style.overflow).toBe('');
  });

  it('pide cerrar con el botón, el fondo y escape', () => {
    const { host, el } = setup();
    (el.querySelector('.yep-modal__close') as HTMLButtonElement).click();
    (el.querySelector('.yep-modal__backdrop') as HTMLElement).click();
    pressEscape(el);
    expect(host.closes).toBe(3);
  });

  it('no cierra al hacer clic dentro del diálogo', () => {
    const { host, el } = setup();
    (el.querySelector('.yep-modal__dialog') as HTMLElement).click();
    expect(host.closes).toBe(0);
  });

  it('respeta dismissOnBackdrop y loading', () => {
    const { fixture, host, el } = setup();
    host.dismissOnBackdrop.set(false);
    host.loading.set(true);
    fixture.detectChanges();
    (el.querySelector('.yep-modal__backdrop') as HTMLElement).click();
    expect((el.querySelector('.yep-modal__close') as HTMLButtonElement).disabled).toBe(true);
    pressEscape(el);
    expect(host.closes).toBe(0);
  });
});
