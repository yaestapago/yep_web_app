import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DescriptionItem } from './description-item';
import { DescriptionList, DescriptionListColumns, DescriptionListLayout } from './description-list';

@Component({
  imports: [DescriptionList, DescriptionItem],
  template: `
    <yep-description-list [columns]="columns()" [layout]="layout()">
      <yep-description-item label="NIT" [mono]="true">902064229</yep-description-item>
      <yep-description-item label="Teléfono" hint="Principal" [span]="3">+57 315 714 3397</yep-description-item>
      <yep-description-item label="Código para compartir" [copy]="code" (copied)="onCopied()">527109</yep-description-item>
    </yep-description-list>
  `,
})
class HostComponent {
  readonly columns = signal<DescriptionListColumns>(2);
  readonly layout = signal<DescriptionListLayout>('stacked');
  readonly code = '527109';
  copies = 0;

  onCopied(): void {
    this.copies++;
  }
}

describe('DescriptionList', () => {
  async function create() {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, list: el.querySelector('yep-description-list') as HTMLElement };
  }

  it('creates standalone with defaults (2 columns, stacked)', async () => {
    await TestBed.configureTestingModule({ imports: [DescriptionList] }).compileComponents();
    const fixture = TestBed.createComponent(DescriptionList);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance).toBeTruthy();
    expect(el.getAttribute('role')).toBe('list');
    expect(el.classList.contains('yep-description-list--stacked')).toBe(true);
    expect(el.style.getPropertyValue('--yep-dl-columns')).toBe('2');
  });

  it('applies columns and layout', async () => {
    const { fixture, list } = await create();
    fixture.componentInstance.columns.set(3);
    fixture.componentInstance.layout.set('inline');
    fixture.detectChanges();

    expect(list.style.getPropertyValue('--yep-dl-columns')).toBe('3');
    expect(list.classList.contains('yep-description-list--inline')).toBe(true);
    expect(list.classList.contains('yep-description-list--stacked')).toBe(false);
    const items = Array.from(list.querySelectorAll('yep-description-item'));
    expect(items.every((item) => item.classList.contains('yep-description-item--inline'))).toBe(true);
  });

  it('projects items with label, value, hint and mono', async () => {
    const { list } = await create();
    const items = list.querySelectorAll('yep-description-item');

    expect(items.length).toBe(3);
    expect(items[0].getAttribute('role')).toBe('listitem');
    expect(items[0].querySelector('.yep-description-item__label')?.textContent?.trim()).toBe('NIT');
    const value = items[0].querySelector('.yep-description-item__value')!;
    expect(value.textContent?.trim()).toBe('902064229');
    expect(value.classList.contains('yep-description-item__value--mono')).toBe(true);
    expect(items[0].querySelector('.yep-description-item__hint')).toBeNull();
    expect(items[1].querySelector('.yep-description-item__hint')?.textContent?.trim()).toBe('Principal');
    expect(items[1].querySelector('.yep-description-item__value--mono')).toBeNull();
  });

  it('caps the item span at the list columns', async () => {
    const { fixture, list } = await create();
    const wide = list.querySelectorAll('yep-description-item')[1] as HTMLElement;
    expect(wide.style.getPropertyValue('--yep-dl-span')).toBe('2');

    fixture.componentInstance.columns.set(3);
    fixture.detectChanges();
    expect(wide.style.getPropertyValue('--yep-dl-span')).toBe('3');
  });

  it('shows the copy button only when copy has a value and emits copied', async () => {
    const { fixture, list } = await create();
    const items = list.querySelectorAll('yep-description-item');

    expect(items[0].querySelector('.yep-description-item__copy')).toBeNull();
    const button = items[2].querySelector(
      'yep-icon-button.yep-description-item__copy button',
    ) as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.classList).toContain('yep-icon-button--sm');
    expect(button.getAttribute('aria-label')).toBe('Copiar Código para compartir');
    expect(button.querySelector('svg.lucide-copy')).toBeTruthy();

    button.click();
    expect(fixture.componentInstance.copies).toBe(1);
  });
});

describe('DescriptionItem', () => {
  it('creates outside a list with stacked layout and the given span', async () => {
    await TestBed.configureTestingModule({ imports: [DescriptionItem] }).compileComponents();
    const fixture = TestBed.createComponent(DescriptionItem);
    fixture.componentRef.setInput('label', 'Plan');
    fixture.componentRef.setInput('span', 2);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance).toBeTruthy();
    expect(el.classList.contains('yep-description-item--inline')).toBe(false);
    expect(el.style.getPropertyValue('--yep-dl-span')).toBe('2');
    expect(el.querySelector('.yep-description-item__label')?.textContent?.trim()).toBe('Plan');
  });
});
