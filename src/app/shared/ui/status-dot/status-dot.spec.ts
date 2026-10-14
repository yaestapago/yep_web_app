import { TestBed } from '@angular/core/testing';

import { StatusDot } from './status-dot';

describe('StatusDot', () => {
  function setup(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(StatusDot);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it.each(['online', 'delayed', 'offline', 'unknown'] as const)(
    'aplica la clase del nivel %s en el host',
    (level) => {
      const { host } = setup({ level });
      expect(host.classList).toContain('yep-status');
      expect(host.classList).toContain(`yep-status--${level}`);
      expect(host.getAttribute('role')).toBe('status');
      expect(host.querySelector('.yep-status__dot')).toBeTruthy();
    },
  );

  it('muestra la etiqueta del nivel y el detalle en el aria-label', () => {
    const { host } = setup({ level: 'online', detail: 'hace 3 min' });
    expect(host.querySelector('.yep-status__label')?.textContent?.trim()).toBe('En línea');
    expect(host.querySelector('.yep-status__detail')?.textContent).toContain('hace 3 min');
    expect(host.getAttribute('aria-label')).toBe('En línea · hace 3 min');
  });

  it('en modo compacto deja solo el punto', () => {
    const { host } = setup({ level: 'offline', compact: true });
    expect(host.querySelector('.yep-status__text')).toBeNull();
    expect(host.getAttribute('aria-label')).toBe('Fuera de línea');
  });

  it('atenúa la etiqueta informativa', () => {
    const { host } = setup({ level: 'unknown', label: 'Notificador Gmail', labelMuted: true });
    const label = host.querySelector('.yep-status__label') as HTMLElement;
    expect(label.textContent?.trim()).toBe('Notificador Gmail');
    expect(label.classList).toContain('yep-status__label--muted');
  });
});
