import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Table, TableDensity } from './table';

@Component({
  imports: [Table],
  template: `
    <div class="yep-table-wrap">
      <table yepTable [density]="density()" [stackOnMobile]="stack()" [clickableRows]="clickable()">
        <thead>
          <tr><th>Cuenta</th><th class="num">Monto</th><th class="actions"></th></tr>
        </thead>
        <tbody>
          <tr (click)="onRow()">
            <td data-label="Cuenta">Caja principal</td>
            <td data-label="Monto" class="num">$ 210.000</td>
            <td class="actions"><button type="button">Editar</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
class HostComponent {
  readonly density = signal<TableDensity>('comfortable');
  readonly stack = signal(true);
  readonly clickable = signal(false);
  rows = 0;

  onRow(): void {
    this.rows++;
  }
}

@Component({
  imports: [Table],
  template: `<table yepTable clickableRows><tbody><tr><td>x</td></tr></tbody></table>`,
})
class AttributeHostComponent {}

describe('Table', () => {
  async function create() {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, table: el.querySelector('table') as HTMLTableElement };
  }

  it('applies defaults on the native table (comfortable, stacked on mobile, not clickable)', async () => {
    const { table } = await create();

    expect(table.classList.contains('yep-table')).toBe(true);
    expect(table.classList.contains('yep-table--compact')).toBe(false);
    expect(table.classList.contains('yep-table--stack')).toBe(true);
    expect(table.classList.contains('yep-table--clickable')).toBe(false);
  });

  it('keeps the projected native markup in place', async () => {
    const { el, table } = await create();

    expect(table.parentElement?.classList.contains('yep-table-wrap')).toBe(true);
    expect(table.querySelector(':scope > thead > tr > th.num')?.textContent?.trim()).toBe('Monto');
    const cells = table.querySelectorAll(':scope > tbody > tr > td');
    expect(cells.length).toBe(3);
    expect(cells[1].getAttribute('data-label')).toBe('Monto');
    expect(cells[1].classList.contains('num')).toBe(true);
    expect(el.querySelector('td.actions button')).toBeTruthy();
  });

  it('applies density, stackOnMobile and clickableRows', async () => {
    const { fixture, table } = await create();
    fixture.componentInstance.density.set('compact');
    fixture.componentInstance.stack.set(false);
    fixture.componentInstance.clickable.set(true);
    fixture.detectChanges();

    expect(table.classList.contains('yep-table--compact')).toBe(true);
    expect(table.classList.contains('yep-table--stack')).toBe(false);
    expect(table.classList.contains('yep-table--clickable')).toBe(true);
  });

  it('leaves row events to the page', async () => {
    const { fixture, table } = await create();
    (table.querySelector('tbody tr') as HTMLElement).click();

    expect(fixture.componentInstance.rows).toBe(1);
  });

  it('accepts boolean inputs as bare attributes', async () => {
    await TestBed.configureTestingModule({ imports: [AttributeHostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(AttributeHostComponent);
    fixture.detectChanges();
    const table = (fixture.nativeElement as HTMLElement).querySelector('table')!;

    expect(table.classList.contains('yep-table--clickable')).toBe(true);
    expect(table.classList.contains('yep-table--stack')).toBe(true);
  });
});
