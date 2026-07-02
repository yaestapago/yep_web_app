import { Component, computed, forwardRef, input as defineInput, output, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideCheck } from '@lucide/angular';

type CheckboxAppearance = 'box' | 'chip';

let nextCheckboxId = 0;

/**
 * Primitivo de checkbox reutilizable.
 * Soporta dos modos de uso:
 * - **Controlado**: `[checked]` + `(checkedChange)` (para usos template-driven, como las
 *   listas de sedes o el catálogo del dashboard, y para componerlo dentro de `yep-day-picker`).
 * - **Reactive Forms**: como `ControlValueAccessor` vía `formControlName`.
 *
 * `appearance="box"` (default) muestra la casilla; `appearance="chip"` lo dibuja como una
 * píldora marcable (usado por los chips de días).
 */
@Component({
  selector: 'yep-checkbox',
  imports: [LucideCheck],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Checkbox),
      multi: true,
    },
  ],
  templateUrl: './checkbox.html',
  styleUrl: './checkbox.scss',
})
export class Checkbox implements ControlValueAccessor {
  readonly id = defineInput(`yep-checkbox-${nextCheckboxId++}`);
  readonly checked = defineInput(false);
  readonly appearance = defineInput<CheckboxAppearance>('box');
  readonly label = defineInput('');
  readonly ariaLabel = defineInput('');
  readonly disabled = defineInput(false);
  readonly error = defineInput('');
  readonly dataCy = defineInput('');
  readonly checkedChange = output<boolean>();

  isControlDisabled = false;
  private hasControl = false;
  private readonly cvaValue = signal(false);

  /** Estado efectivo: el valor del form si hay control, o el input `checked` si es controlado. */
  readonly isChecked = computed(() => (this.hasControl ? this.cvaValue() : this.checked()));

  private onChange: (value: boolean) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  toggle(): void {
    if (this.disabled() || this.isControlDisabled) {
      return;
    }
    const next = !this.isChecked();
    if (this.hasControl) {
      this.cvaValue.set(next);
      this.onChange(next);
    }
    this.checkedChange.emit(next);
    this.onTouched();
  }

  writeValue(value: boolean | null | undefined): void {
    this.cvaValue.set(Boolean(value));
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.hasControl = true;
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  markTouched(): void {
    this.onTouched();
  }

  setDisabledState(isDisabled: boolean): void {
    this.isControlDisabled = isDisabled;
  }
}
