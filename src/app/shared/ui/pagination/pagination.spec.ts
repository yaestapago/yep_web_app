import { TestBed } from '@angular/core/testing';

import { Pagination } from './pagination';

describe('Pagination', () => {
  async function create(page: number, pageCount: number) {
    await TestBed.configureTestingModule({ imports: [Pagination] }).compileComponents();
    const fixture = TestBed.createComponent(Pagination);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('pageCount', pageCount);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((value) => emitted.push(value));
    const [prev, next] = Array.from(el.querySelectorAll('button')) as HTMLButtonElement[];
    return { fixture, el, prev, next, emitted };
  }

  it('creates a navigation with "Página X de Y"', async () => {
    const { fixture, el, prev, next } = await create(2, 9);

    expect(fixture.componentInstance).toBeTruthy();
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Paginación');
    expect(el.querySelector('.yep-pagination__status')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Página 2 de 9',
    );
    expect(prev.getAttribute('aria-label')).toBe('Página anterior');
    expect(next.getAttribute('aria-label')).toBe('Página siguiente');
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(false);
  });

  it('emits the previous and next page', async () => {
    const { prev, next, emitted } = await create(2, 9);
    prev.click();
    next.click();

    expect(emitted).toEqual([1, 3]);
  });

  it('disables the buttons at the limits and does not emit', async () => {
    const first = await create(1, 3);
    expect(first.prev.disabled).toBe(true);
    expect(first.next.disabled).toBe(false);

    TestBed.resetTestingModule();
    const last = await create(3, 3);
    expect(last.prev.disabled).toBe(false);
    expect(last.next.disabled).toBe(true);
    last.next.click();
    expect(last.emitted).toEqual([]);
  });

  it('shows at least one page when there are no pages', async () => {
    const { el, prev, next } = await create(1, 0);

    expect(el.querySelector('.yep-pagination__status')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Página 1 de 1',
    );
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
  });
});
