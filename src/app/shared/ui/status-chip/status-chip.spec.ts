import { TestBed } from '@angular/core/testing';

import { StatusChip, type StatusChipTone } from './status-chip';

describe('StatusChip', () => {
  async function create(inputs: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({ imports: [StatusChip] }).compileComponents();
    const fixture = TestBed.createComponent(StatusChip);
    fixture.componentRef.setInput('label', 'En línea');
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, chip: el.querySelector('.yep-status-chip') as HTMLElement };
  }

  it('crea un chip neutral sm con punto y etiqueta', async () => {
    const { fixture, chip } = await create();

    expect(fixture.componentInstance).toBeTruthy();
    expect(chip.classList).toContain('yep-status-chip');
    expect(chip.classList).toContain('yep-status-chip--neutral');
    expect(chip.classList).toContain('yep-status-chip--sm');
    expect(chip.querySelector('.yep-status-chip__dot')?.getAttribute('aria-hidden')).toBe('true');
    expect(chip.querySelector('.yep-status-chip__label')?.textContent?.trim()).toBe('En línea');
  });

  it.each<StatusChipTone>(['success', 'warning', 'error', 'info', 'live'])(
    'aplica el tono %s',
    async (tone) => {
      const { chip } = await create({ tone });
      expect(chip.classList).toContain(`yep-status-chip--${tone}`);
      expect(chip.classList).not.toContain('yep-status-chip--neutral');
    },
  );

  it('aplica el tamaño md', async () => {
    const { chip } = await create({ size: 'md' });
    expect(chip.classList).toContain('yep-status-chip--md');
    expect(chip.classList).not.toContain('yep-status-chip--sm');
  });

  it('oculta el punto con dot=false', async () => {
    const { chip } = await create({ dot: false });
    expect(chip.querySelector('.yep-status-chip__dot')).toBeNull();
  });
});
