import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnnouncementPreview } from './announcement-preview';

describe('AnnouncementPreview (modal en el celular)', () => {
  let fixture: ComponentFixture<AnnouncementPreview>;

  function render(inputs: Record<string, unknown>): HTMLElement {
    fixture = TestBed.createComponent(AnnouncementPreview);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (root: HTMLElement, id: string) =>
    root.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

  it('pinta tono, título, cuerpo, botón y «Más tarde» para until_action', () => {
    const root = render({
      tone: 'danger',
      title: 'YEP dejó de escuchar los pagos',
      body: 'Android apagó la escucha.\nToca «Activar».',
      actionType: 'open_notification_access',
      actionLabel: 'Activar',
      repeat: 'until_action',
    });
    expect(root.querySelector('[data-testid="preview-sheet"]')?.getAttribute('data-tone')).toBe(
      'danger',
    );
    expect(text(root, 'preview-tone')).toBe('Urgente');
    expect(text(root, 'preview-title')).toBe('YEP dejó de escuchar los pagos');
    // El salto de línea se conserva para que `white-space: pre-line` lo pinte.
    expect(root.querySelector('[data-testid="preview-body"]')?.textContent).toContain(
      'Android apagó la escucha.\nToca «Activar».',
    );
    expect(text(root, 'preview-primary')).toBe('Activar');
    expect(text(root, 'preview-dismiss')).toBe('Más tarde');
  });

  it('repeat=once dice «Cerrar»; sin acción solo queda el botón de cerrar', () => {
    const root = render({ title: 'Hola', body: 'Texto', repeat: 'once' });
    expect(root.querySelector('[data-testid="preview-primary"]')).toBeNull();
    expect(text(root, 'preview-dismiss')).toBe('Cerrar');
  });

  it('no descartable: sin «Cerrar» y con el candado', () => {
    const root = render({
      title: 'Actualiza YEP',
      body: 'Tu versión ya no es compatible.',
      actionType: 'update_app',
      actionLabel: 'Actualizar',
      dismissible: false,
    });
    expect(root.querySelector('[data-testid="preview-dismiss"]')).toBeNull();
    expect(text(root, 'preview-locked')).toBe('No se puede cerrar');
  });

  it('sin botón, aunque diga no descartable, se puede cerrar (contrato)', () => {
    const root = render({ title: 'x', body: 'y', dismissible: false });
    expect(text(root, 'preview-dismiss')).toBe('Cerrar');
  });

  it('una acción que la app no entiende no se pinta (compatibilidad hacia adelante)', () => {
    const root = render({
      app: 'yep',
      title: 'x',
      body: 'y',
      actionType: 'run_self_test',
      actionLabel: 'Probar',
    });
    expect(root.querySelector('[data-testid="preview-primary"]')).toBeNull();
    expect(text(root, 'preview-dismiss')).toBe('Cerrar');
  });

  it('la notificación de Android solo sale en el Notificador con notify', () => {
    const notifier = render({ app: 'notifier', notify: true, title: 'Aviso', body: 'Texto' });
    expect(text(notifier, 'preview-notification')).toContain('Avisos de YEP');
    expect(text(notifier, 'preview-notification')).toContain('Aviso');

    const yep = render({ app: 'yep', notify: true, title: 'Aviso', body: 'Texto' });
    expect(yep.querySelector('[data-testid="preview-notification"]')).toBeNull();

    const quiet = render({ app: 'notifier', notify: false, title: 'Aviso', body: 'Texto' });
    expect(quiet.querySelector('[data-testid="preview-notification"]')).toBeNull();
  });

  it('sin textos muestra un ejemplo', () => {
    const root = render({});
    expect(text(root, 'preview-title')).toBe('Título del aviso');
    expect(root.querySelector('[data-testid="preview-title"]')?.classList).toContain(
      'is-placeholder',
    );
  });

  it('se actualiza en vivo al cambiar los inputs', () => {
    const root = render({ title: 'Uno', body: 'b' });
    fixture.componentRef.setInput('title', 'Dos');
    fixture.componentRef.setInput('tone', 'success');
    fixture.detectChanges();
    expect(text(root, 'preview-title')).toBe('Dos');
    expect(text(root, 'preview-tone')).toBe('Buena noticia');
  });
});
