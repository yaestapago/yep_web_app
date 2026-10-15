import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { IdPicker, parsePastedIds } from './id-picker';

describe('IdPicker', () => {
  it('parsePastedIds separa ObjectIds válidos (sin repetir) de lo que no reconoce', () => {
    expect(
      parsePastedIds(
        '6710C0FFEE0000000000ABCD, "6710c0ffee0000000000abce"\n6710c0ffee0000000000abcd; hola 123',
      ),
    ).toEqual({
      ids: ['6710c0ffee0000000000abcd', '6710c0ffee0000000000abce'],
      invalid: ['hola', '123'],
    });
    expect(parsePastedIds('   ')).toEqual({ ids: [], invalid: [] });
  });

  it('agrega lo pegado y lo buscado, y avisa al formulario', () => {
    TestBed.configureTestingModule({});
    const fixture: ComponentFixture<IdPicker> = TestBed.createComponent(IdPicker);
    fixture.componentRef.setInput('label', 'Negocios');
    fixture.componentRef.setInput('search', () => of([]));
    fixture.detectChanges();
    const picker = fixture.componentInstance;
    const changes: string[][] = [];
    picker.registerOnChange((value) => changes.push(value));

    picker.pasteText.set('6710c0ffee0000000000abcd x');
    picker.addPasted();
    expect(picker.ids()).toEqual(['6710c0ffee0000000000abcd']);
    expect(picker.pasteError()).toContain('No reconocí: x');

    picker.add({ id: '6710c0ffee0000000000abce', label: 'Supercarnes' });
    fixture.detectChanges();
    expect(picker.chips().map((chip) => chip.label)).toEqual(['ID …00abcd', 'Supercarnes']);
    expect(changes.at(-1)).toEqual(['6710c0ffee0000000000abcd', '6710c0ffee0000000000abce']);

    picker.remove('6710c0ffee0000000000abcd');
    expect(changes.at(-1)).toEqual(['6710c0ffee0000000000abce']);
    picker.clear();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Todos');
  });
});
