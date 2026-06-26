import {
  Component,
  computed,
  forwardRef,
  input as defineInput,
  output,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
  FormsModule,
} from '@angular/forms';

import { Select, type SelectOption } from '../select/select';

type PhoneInputSize = 'sm' | 'md' | 'lg';

export interface PhoneCountry {
  iso2: string;
  name: string;
  callingCode: string;
  lengths: readonly number[];
  favorite?: boolean;
}

export interface PhoneInputValue {
  countryCode: string;
  nationalNumber: string;
  e164: string;
}

const COUNTRIES: readonly PhoneCountry[] = [
  { iso2: 'CO', name: 'Colombia', callingCode: '57', lengths: [10], favorite: true },
  {
    iso2: 'US',
    name: 'Estados Unidos',
    callingCode: '1',
    lengths: [10],
    favorite: true,
  },
  { iso2: 'MX', name: 'Mexico', callingCode: '52', lengths: [10], favorite: true },
  { iso2: 'PE', name: 'Peru', callingCode: '51', lengths: [9], favorite: true },
  { iso2: 'EC', name: 'Ecuador', callingCode: '593', lengths: [9, 10], favorite: true },
  { iso2: 'CL', name: 'Chile', callingCode: '56', lengths: [9], favorite: true },
  { iso2: 'AR', name: 'Argentina', callingCode: '54', lengths: [10], favorite: true },
  { iso2: 'ES', name: 'Espana', callingCode: '34', lengths: [9] },
  { iso2: 'BR', name: 'Brasil', callingCode: '55', lengths: [10, 11] },
  { iso2: 'BO', name: 'Bolivia', callingCode: '591', lengths: [8] },
  { iso2: 'CR', name: 'Costa Rica', callingCode: '506', lengths: [8] },
  { iso2: 'DO', name: 'Republica Dominicana', callingCode: '1', lengths: [10] },
  { iso2: 'GT', name: 'Guatemala', callingCode: '502', lengths: [8] },
  { iso2: 'HN', name: 'Honduras', callingCode: '504', lengths: [8] },
  { iso2: 'NI', name: 'Nicaragua', callingCode: '505', lengths: [8] },
  { iso2: 'PA', name: 'Panama', callingCode: '507', lengths: [8] },
  { iso2: 'PY', name: 'Paraguay', callingCode: '595', lengths: [9] },
  { iso2: 'SV', name: 'El Salvador', callingCode: '503', lengths: [8] },
  { iso2: 'UY', name: 'Uruguay', callingCode: '598', lengths: [8] },
  { iso2: 'VE', name: 'Venezuela', callingCode: '58', lengths: [10] },
];

let nextPhoneInputId = 0;

@Component({
  selector: 'yep-phone-input',
  imports: [FormsModule, Select],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PhoneInput),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => PhoneInput),
      multi: true,
    },
  ],
  templateUrl: './phone-input.html',
  styleUrl: './phone-input.scss',
})
export class PhoneInput implements ControlValueAccessor, Validator {
  readonly id = defineInput(`yep-phone-input-${nextPhoneInputId++}`);
  readonly label = defineInput('');
  readonly size = defineInput<PhoneInputSize>('md');
  readonly placeholder = defineInput('Numero de telefono');
  readonly hint = defineInput('');
  readonly error = defineInput('');
  readonly disabled = defineInput(false);
  readonly required = defineInput(false);
  readonly validateOnInit = defineInput(true);

  readonly countryCodeChange = output<string>();
  readonly phoneNumberChange = output<string>();
  readonly validChange = output<boolean>();
  readonly valueChange = output<PhoneInputValue>();

  readonly selectedCountryIso = signal('CO');
  readonly selectedCountryCode = signal('57');
  readonly phoneNumber = signal('');
  isControlDisabled = false;

  readonly countries = computed(() =>
    [...COUNTRIES].sort((left, right) => {
      if (left.favorite !== right.favorite) {
        return left.favorite ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    }),
  );

  readonly countryOptions = computed<SelectOption[]>(() =>
    this.countries().map((country) => ({
      id: country.iso2,
      label: `+${country.callingCode} ${country.name}`,
      shortLabel: `+${country.callingCode}`,
      countryCode: country.iso2,
    })),
  );

  readonly selectedCountry = computed(
    () =>
      this.countries().find((country) => country.iso2 === this.selectedCountryIso()) ??
      this.countries()[0],
  );

  readonly maxLength = computed(() => Math.max(...this.selectedCountry().lengths));
  readonly currentValue = computed<PhoneInputValue>(() => {
    const countryCode = this.selectedCountryCode();
    const nationalNumber = this.phoneNumber();
    return {
      countryCode,
      nationalNumber,
      e164: nationalNumber ? `+${countryCode}${nationalNumber}` : '',
    };
  });

  readonly validationMessage = computed(() => {
    if (this.error()) {
      return this.error();
    }
    if (!this.shouldShowInternalError()) {
      return '';
    }
    const lengths = this.selectedCountry().lengths.join(' o ');
    return `Debe tener ${lengths} digitos.`;
  });

  private touched = false;
  private onChange: (value: PhoneInputValue) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private onValidatorChange: () => void = () => undefined;

  writeValue(value: PhoneInputValue | string | null | undefined): void {
    if (!value) {
      this.phoneNumber.set('');
      return;
    }

    if (typeof value === 'string') {
      this.writeFromString(value);
      return;
    }

    this.setCountryFromCallingCode(this.onlyDigits(value.countryCode) || '57');
    this.phoneNumber.set(this.onlyDigits(value.nationalNumber).slice(0, this.maxLength()));
  }

  registerOnChange(fn: (value: PhoneInputValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isControlDisabled = isDisabled;
  }

  validate(_control: AbstractControl): ValidationErrors | null {
    const phone = this.phoneNumber();
    if (!phone) {
      return this.required() ? { required: true } : null;
    }
    return this.isValid()
      ? null
      : { phoneLength: { expected: this.selectedCountry().lengths, actual: phone.length } };
  }

  updateCountry(option: SelectOption | SelectOption[] | null): void {
    const selected = Array.isArray(option) ? option[0] : option;
    const iso2 = selected?.id;
    const country =
      this.countries().find((current) => current.iso2 === iso2) ?? this.countries()[0];
    this.selectedCountryIso.set(country.iso2);
    this.selectedCountryCode.set(country.callingCode);
    this.phoneNumber.set('');
    this.touched = true;
    this.countryCodeChange.emit(this.selectedCountryCode());
    this.emitValue();
  }

  updatePhone(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.setPhone(value);
  }

  handlePaste(event: ClipboardEvent): void {
    event.preventDefault();
    this.setPhone(event.clipboardData?.getData('text') ?? '');
  }

  markTouched(): void {
    this.touched = true;
    this.onTouched();
  }

  private writeFromString(value: string): void {
    const digits = this.onlyDigits(value);
    const country = this.countries()
      .filter((current) => digits.startsWith(current.callingCode))
      .sort((left, right) => right.callingCode.length - left.callingCode.length)[0];

    if (country) {
      this.selectedCountryIso.set(country.iso2);
      this.selectedCountryCode.set(country.callingCode);
      this.phoneNumber.set(
        digits.slice(country.callingCode.length, country.callingCode.length + this.maxLength()),
      );
    } else {
      this.phoneNumber.set(digits.slice(0, this.maxLength()));
    }
  }

  private setCountryFromCallingCode(callingCode: string): void {
    const country =
      this.countries().find((current) => current.callingCode === callingCode) ??
      this.countries()[0];
    this.selectedCountryIso.set(country.iso2);
    this.selectedCountryCode.set(country.callingCode);
  }

  private setPhone(value: string): void {
    this.phoneNumber.set(this.onlyDigits(value).slice(0, this.maxLength()));
    this.phoneNumberChange.emit(this.phoneNumber());
    this.emitValue();
  }

  private emitValue(): void {
    const value = this.currentValue();
    this.onChange(value);
    this.valueChange.emit(value);
    this.validChange.emit(this.isValid());
    this.onValidatorChange();
  }

  private isValid(): boolean {
    const phone = this.phoneNumber();
    if (!phone) {
      return !this.required();
    }
    return this.selectedCountry().lengths.includes(phone.length);
  }

  private shouldShowInternalError(): boolean {
    const phone = this.phoneNumber();
    if (!phone) {
      return false;
    }
    return (this.validateOnInit() || this.touched) && !this.isValid();
  }

  private onlyDigits(value: string): string {
    return value.replace(/\D/g, '');
  }
}
