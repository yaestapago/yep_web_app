import { TestBed } from '@angular/core/testing';

import { FileDrop } from './file-drop';

/** jsdom no tiene `DataTransfer`: un objeto mínimo con `files` y `types` basta para los eventos. */
function dragEvent(type: string, files: File[] = [], types: string[] = ['Files']): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { files, types, dropEffect: 'none' },
  });
  return event;
}

/** Permite asignar `files` al input en jsdom, donde `FileList` no se puede construir. */
function makeFilesWritable(input: HTMLInputElement): void {
  Object.defineProperty(input, 'files', { value: null, writable: true, configurable: true });
}

describe('FileDrop', () => {
  async function create(inputs: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({ imports: [FileDrop] }).compileComponents();
    const fixture = TestBed.createComponent(FileDrop);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      el,
      zone: el.querySelector('.yep-file-drop__zone') as HTMLElement,
      input: el.querySelector('input[type=file]') as HTMLInputElement,
    };
  }

  it('creates in the resting state with a real file input', async () => {
    const { fixture, el, zone, input } = await create();

    expect(fixture.componentInstance).toBeTruthy();
    expect(input.accept).toBe('image/*,application/pdf');
    expect(input.multiple).toBe(false);
    expect(input.disabled).toBe(false);
    expect(zone.getAttribute('role')).toBe('button');
    expect(zone.getAttribute('tabindex')).toBe('0');
    expect(zone.hasAttribute('aria-describedby')).toBe(false);
    expect(el.querySelector('.yep-file-drop__label')?.textContent?.trim()).toBe(
      'Arrastra el archivo o haz clic para elegirlo',
    );
    expect(zone.classList.contains('yep-file-drop__zone--dragging')).toBe(false);
    expect(el.querySelector('.yep-file-drop__files')).toBeNull();
    expect(el.querySelector('.yep-file-drop--button')).toBeNull();
  });

  it('passes accept and multiple to the native input', async () => {
    const { input } = await create({ accept: 'image/*', multiple: true });

    expect(input.accept).toBe('image/*');
    expect(input.multiple).toBe(true);
  });

  it('emits the native change event when a file is chosen with the dialog', async () => {
    const { fixture, input } = await create();
    const emitted: Event[] = [];
    fixture.componentInstance.fileChange.subscribe((event) => emitted.push(event));

    const change = new Event('change', { bubbles: true });
    input.dispatchEvent(change);

    expect(emitted).toEqual([change]);
    expect(emitted[0].target).toBe(input);
  });

  it('opens the picker on click and with Enter or Space', async () => {
    const { zone, input } = await create();
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);

    zone.click();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    zone.dispatchEvent(enter);
    const space = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
    zone.dispatchEvent(space);
    zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

    expect(click).toHaveBeenCalledTimes(3);
    expect(enter.defaultPrevented).toBe(true);
    expect(space.defaultPrevented).toBe(true);
  });

  it('shows the dragging state while files are over the zone', async () => {
    const { fixture, zone } = await create();

    const over = dragEvent('dragover');
    zone.dispatchEvent(dragEvent('dragenter'));
    zone.dispatchEvent(over);
    fixture.detectChanges();

    expect(over.defaultPrevented).toBe(true);
    expect(zone.classList.contains('yep-file-drop__zone--dragging')).toBe(true);
    expect(zone.querySelector('.yep-icon-tile--active')).toBeTruthy();

    zone.dispatchEvent(dragEvent('dragleave'));
    fixture.detectChanges();

    expect(zone.classList.contains('yep-file-drop__zone--dragging')).toBe(false);
  });

  it('ignores dragging text instead of files', async () => {
    const { fixture, zone } = await create();

    const over = dragEvent('dragover', [], ['text/plain']);
    zone.dispatchEvent(over);
    fixture.detectChanges();

    expect(over.defaultPrevented).toBe(false);
    expect(zone.classList.contains('yep-file-drop__zone--dragging')).toBe(false);
  });

  it('assigns dropped files to the input and dispatches a native change', async () => {
    const { fixture, zone, input } = await create({ multiple: true });
    makeFilesWritable(input);
    const emitted: Event[] = [];
    fixture.componentInstance.fileChange.subscribe((event) => emitted.push(event));
    const files = [
      new File(['a'], 'comprobante.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'otro.pdf', { type: 'application/pdf' }),
    ];

    zone.dispatchEvent(dragEvent('dragenter', files));
    const drop = dragEvent('drop', files);
    zone.dispatchEvent(drop);
    fixture.detectChanges();

    expect(drop.defaultPrevented).toBe(true);
    expect(emitted.length).toBe(1);
    expect(emitted[0].type).toBe('change');
    expect(emitted[0].target).toBe(input);
    expect(input.files as unknown).toBe(files);
    expect(zone.classList.contains('yep-file-drop__zone--dragging')).toBe(false);
  });

  it('ignores drag and drop when disabled or allowDrop is false', async () => {
    for (const inputs of [{ disabled: true }, { allowDrop: false }]) {
      TestBed.resetTestingModule();
      const { fixture, zone, input } = await create(inputs);
      makeFilesWritable(input);
      const emitted: Event[] = [];
      fixture.componentInstance.fileChange.subscribe((event) => emitted.push(event));

      zone.dispatchEvent(dragEvent('dragover'));
      const drop = dragEvent('drop', [new File(['a'], 'a.png')]);
      zone.dispatchEvent(drop);
      fixture.detectChanges();

      expect(drop.defaultPrevented).toBe(false);
      expect(emitted.length).toBe(0);
      expect(zone.classList.contains('yep-file-drop__zone--dragging')).toBe(false);
    }
  });

  it('disables the zone and the input, and does not open the picker', async () => {
    const { el, zone, input } = await create({ disabled: true });
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);

    zone.click();
    zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));

    expect(click).not.toHaveBeenCalled();
    expect(input.disabled).toBe(true);
    expect(zone.getAttribute('aria-disabled')).toBe('true');
    expect(zone.getAttribute('tabindex')).toBe('-1');
    expect(zone.classList.contains('yep-file-drop__zone--disabled')).toBe(true);
    expect(el.classList.contains('yep-file-drop-host--disabled')).toBe(true);
  });

  it('renders as a button when allowDrop is false', async () => {
    const { el } = await create({ allowDrop: false, buttonLabel: 'Subir comprobante' });

    expect(el.querySelector('.yep-file-drop--button')).toBeTruthy();
    expect(el.querySelector('.yep-file-drop__button-label')?.textContent?.trim()).toBe('Subir comprobante');
  });

  it('describes the zone and the input with the hint and the error', async () => {
    const { fixture, el, zone, input } = await create({ hint: 'JPG, PNG o PDF, máximo 5 MB' });
    const hint = el.querySelector('.yep-file-drop__hint--inside')!;

    expect(hint.textContent?.trim()).toBe('JPG, PNG o PDF, máximo 5 MB');
    expect(zone.getAttribute('aria-describedby')).toBe(hint.id);
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);

    fixture.componentRef.setInput('error', 'El archivo no es una imagen.');
    fixture.detectChanges();
    const error = el.querySelector('.yep-file-drop__error')!;

    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent?.trim()).toBe('El archivo no es una imagen.');
    expect(zone.classList.contains('yep-file-drop__zone--error')).toBe(true);
    expect(zone.getAttribute('aria-describedby')).toBe(`${hint.id} ${error.id}`);
  });

  it('lists chosen files with preview, size, progress and remove', async () => {
    const { fixture, el } = await create({
      files: [
        { name: 'comprobante-nequi.jpg', size: 421_888, previewUrl: 'blob:preview' },
        { name: 'extracto.pdf', size: 2_621_440 },
      ],
      progress: 72,
      removable: true,
    });
    const removed: number[] = [];
    fixture.componentInstance.removed.subscribe((index) => removed.push(index));
    const rows = el.querySelectorAll('.yep-file-drop__file');

    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('img')?.getAttribute('src')).toBe('blob:preview');
    expect(rows[0].querySelector('.yep-file-drop__file-name')?.textContent?.trim()).toBe('comprobante-nequi.jpg');
    expect(rows[0].querySelector('.yep-file-drop__file-size')?.textContent?.trim()).toBe('412 KB');
    expect(rows[1].querySelector('img')).toBeNull();
    expect(rows[1].querySelector('.yep-file-drop__thumb svg')).toBeTruthy();
    expect(rows[1].querySelector('.yep-file-drop__file-size')?.textContent?.trim()).toBe('2,5 MB');
    expect(rows[0].querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('72');

    (rows[1].querySelector('.yep-file-drop__remove') as HTMLButtonElement).click();

    expect(removed).toEqual([1]);
  });

  it('hides progress and remove by default', async () => {
    const { el } = await create({ files: [{ name: 'a.png', size: 10 }] });

    expect(el.querySelector('.yep-file-drop__file-size')?.textContent?.trim()).toBe('10 B');
    expect(el.querySelector('[role=progressbar]')).toBeNull();
    expect(el.querySelector('.yep-file-drop__remove')).toBeNull();
  });
});
