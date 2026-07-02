import { Component, forwardRef, input as defineInput, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { DayOfWeek } from '../../models/schedule.models';
import { Checkbox } from '../checkbox/checkbox';

interface DayChip {
  day: DayOfWeek;
  short: string;
  full: string;
}

/** Orden Lunes→Domingo, consistente con las columnas de la grilla de horarios. */
const DAY_CHIPS: DayChip[] = [
  { day: 1, short: 'Lu', full: 'Lunes' },
  { day: 2, short: 'Ma', full: 'Martes' },
  { day: 3, short: 'Mi', full: 'Miércoles' },
  { day: 4, short: 'Ju', full: 'Jueves' },
  { day: 5, short: 'Vi', full: 'Viernes' },
  { day: 6, short: 'Sa', full: 'Sábado' },
  { day: 0, short: 'Do', full: 'Domingo' },
];

/**
 * Selector de días de la semana como chips marcables (compone `yep-checkbox`).
 * `ControlValueAccessor` sobre `DayOfWeek[]`, alimenta el mismo form control `days`.
 */
@Component({
  selector: 'yep-day-picker',
  imports: [Checkbox],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DayPicker),
      multi: true,
    },
  ],
  templateUrl: './day-picker.html',
  styleUrl: './day-picker.scss',
})
export class DayPicker implements ControlValueAccessor {
  readonly disabled = defineInput(false);
  readonly days = DAY_CHIPS;

  readonly selected = signal<DayOfWeek[]>([]);
  readonly isControlDisabled = signal(false);

  private onChange: (value: DayOfWeek[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  isSelected(day: DayOfWeek): boolean {
    return this.selected().includes(day);
  }

  toggle(day: DayOfWeek, checked: boolean): void {
    if (this.disabled() || this.isControlDisabled()) {
      return;
    }
    const next = checked
      ? [...this.selected(), day]
      : this.selected().filter((value) => value !== day);
    this.selected.set(next);
    this.onChange(next);
    this.onTouched();
  }

  writeValue(value: DayOfWeek[] | null | undefined): void {
    this.selected.set(Array.isArray(value) ? [...value] : []);
  }

  registerOnChange(fn: (value: DayOfWeek[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isControlDisabled.set(isDisabled);
  }
}
