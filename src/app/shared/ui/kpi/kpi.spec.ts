import { TestBed } from '@angular/core/testing';

import { Kpi, type KpiTone } from './kpi';

describe('Kpi', () => {
  async function create(inputs: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({ imports: [Kpi] }).compileComponents();
    const fixture = TestBed.createComponent(Kpi);
    fixture.componentRef.setInput('label', 'Total capturado');
    fixture.componentRef.setInput('value', '$ 2.565.100');
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, kpi: el.querySelector('.yep-kpi') as HTMLElement };
  }

  it('muestra etiqueta y cifra sin punto, ayuda ni variantes por defecto', async () => {
    const { fixture, kpi } = await create();

    expect(fixture.componentInstance).toBeTruthy();
    expect(kpi.querySelector('.yep-kpi__label')?.textContent?.trim()).toBe('Total capturado');
    expect(kpi.querySelector('.yep-kpi__value')?.textContent?.trim()).toBe('$ 2.565.100');
    expect(kpi.querySelector('.yep-kpi__dot')).toBeNull();
    expect(kpi.querySelector('.yep-kpi__hint')).toBeNull();
    expect(kpi.classList).not.toContain('yep-kpi--sm');
    expect(kpi.classList).not.toContain('yep-kpi--emphasis');
    expect(kpi.hasAttribute('aria-busy')).toBe(false);
  });

  it('muestra la ayuda', async () => {
    const { kpi } = await create({ hint: '42 pagos desde las 6:00 a. m.' });
    expect(kpi.querySelector('.yep-kpi__hint')?.textContent?.trim()).toBe(
      '42 pagos desde las 6:00 a. m.',
    );
  });

  it.each<KpiTone>(['success', 'warning', 'error'])('el tono %s pinta solo el punto', async (tone) => {
    const { kpi } = await create({ tone });
    const dot = kpi.querySelector('.yep-kpi__label .yep-kpi__dot');
    expect(dot?.classList).toContain(`yep-kpi__dot--${tone}`);
    expect(dot?.getAttribute('aria-hidden')).toBe('true');
  });

  it('aplica emphasis y tamaño sm', async () => {
    const { kpi } = await create({ emphasis: true, size: 'sm' });
    expect(kpi.classList).toContain('yep-kpi--emphasis');
    expect(kpi.classList).toContain('yep-kpi--sm');
  });

  it('loading muestra esqueleto en lugar de la cifra y marca aria-busy', async () => {
    const { kpi } = await create({ loading: true, hint: 'Hoy' });
    expect(kpi.getAttribute('aria-busy')).toBe('true');
    expect(kpi.querySelector('.yep-kpi__value')).toBeNull();
    expect(kpi.querySelector('.yep-kpi__hint')).toBeNull();
    expect(kpi.querySelector('.yep-kpi__skeleton--value')).not.toBeNull();
    expect(kpi.querySelector('.yep-kpi__skeleton--hint')).not.toBeNull();
    expect(kpi.querySelector('.yep-kpi__label')?.textContent?.trim()).toBe('Total capturado');
  });
});
