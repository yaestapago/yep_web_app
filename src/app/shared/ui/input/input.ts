import { Component, computed, forwardRef, input as defineInput, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideEye, LucideEyeOff } from '@lucide/angular';

type InputType = 'email' | 'number' | 'password' | 'search' | 'tel' | 'text' | 'url';
type InputSize = 'sm' | 'md' | 'lg';

let nextInputId = 0;

@Component({
  selector: 'yep-input',
  imports: [LucideEye, LucideEyeOff],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Input),
      multi: true,
    },
  ],
  templateUrl: './input.html',
  styleUrl: './input.scss',
})
export class Input implements ControlValueAccessor {
  readonly id = defineInput(`yep-input-${nextInputId++}`);
  readonly label = defineInput('');
  readonly type = defineInput<InputType>('text');
  readonly size = defineInput<InputSize>('md');
  readonly placeholder = defineInput('');
  readonly autocomplete = defineInput('');
  readonly hint = defineInput('');
  readonly error = defineInput('');
  readonly disabled = defineInput(false);
  readonly readonly = defineInput(false);
  readonly required = defineInput(false);

  value = '';
  isControlDisabled = false;
  readonly passwordVisible = signal(false);
  readonly inputType = computed(() => (this.type() === 'password' && this.passwordVisible() ? 'text' : this.type()));

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | number | null | undefined): void {
    this.value = value === null || value === undefined ? '' : String(value);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isControlDisabled = isDisabled;
  }

  updateValue(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value = target.value;
    this.onChange(this.value);
  }

  markTouched(): void {
    this.onTouched();
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }
}
