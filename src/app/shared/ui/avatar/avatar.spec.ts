import { TestBed } from '@angular/core/testing';

import { Avatar, type AvatarSize } from './avatar';

describe('Avatar', () => {
  async function create(inputs: Record<string, unknown>) {
    await TestBed.configureTestingModule({ imports: [Avatar] }).compileComponents();
    const fixture = TestBed.createComponent(Avatar);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return { fixture, host, avatar: host.querySelector('.yep-avatar') as HTMLElement };
  }

  it('muestra las iniciales de las dos primeras palabras y el nombre accesible', async () => {
    const { fixture, host, avatar } = await create({ name: 'laura gómez ruiz' });

    expect(fixture.componentInstance).toBeTruthy();
    expect(avatar.textContent?.trim()).toBe('LG');
    expect(host.getAttribute('role')).toBe('img');
    expect(host.getAttribute('aria-label')).toBe('laura gómez ruiz');
    expect(avatar.classList).not.toContain('yep-avatar--40');
    expect(avatar.classList).not.toContain('yep-avatar--48');
  });

  it('usa las dos primeras letras si el nombre tiene una sola palabra', async () => {
    const { avatar } = await create({ name: '  ñandú ' });
    expect(avatar.textContent?.trim()).toBe('ÑA');
  });

  it('sin nombre queda vacío y oculto para lectores de pantalla', async () => {
    const { host, avatar } = await create({ name: '' });
    expect(avatar.textContent?.trim()).toBe('');
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.hasAttribute('aria-label')).toBe(false);
  });

  it.each<AvatarSize>([40, 48])('aplica el tamaño %s', async (size) => {
    const { avatar } = await create({ name: 'Carlos Ruiz', size });
    expect(avatar.classList).toContain(`yep-avatar--${size}`);
  });
});
