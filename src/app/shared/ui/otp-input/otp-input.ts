import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  QueryList,
  ViewChildren,
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
} from '@angular/forms';
import { LucideCircleCheck, LucideCircleX, LucideInfo } from '@lucide/angular';

type OtpStatus = 'idle' | 'sending' | 'validating' | 'success' | 'error';
type OtpEngine = 'email' | 'sms' | '2fa' | 'auth2fa';

const OTP_LENGTH = 6;
const COMPLETE_DEBOUNCE_MS = 400;

@Component({
  selector: 'yep-otp-input',
  imports: [LucideCircleCheck, LucideCircleX, LucideInfo],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => OtpInput),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => OtpInput),
      multi: true,
    },
  ],
  templateUrl: './otp-input.html',
  styleUrl: './otp-input.scss',
})
export class OtpInput implements AfterViewInit, OnDestroy, ControlValueAccessor, Validator {
  readonly engine = defineInput<OtpEngine>('email');
  readonly status = defineInput<OtpStatus>('idle');
  readonly errorMessage = defineInput('');
  readonly resendSeconds = defineInput(0);
  readonly disabled = defineInput(false);

  readonly codeChanged = output<string>();
  readonly codeCompleted = output<string>();
  readonly resendRequested = output<void>();

  @ViewChildren('otpInput') private readonly inputRefs?: QueryList<ElementRef<HTMLInputElement>>;

  readonly indexes = Array.from({ length: OTP_LENGTH }, (_, index) => index);
  readonly digits = signal<string[]>(Array(OTP_LENGTH).fill(''));
  readonly focusedIndex = signal<number | null>(null);
  readonly value = computed(() => this.digits().join(''));
  readonly isComplete = computed(() => this.value().length === OTP_LENGTH);
  readonly resendLabel = computed(() => this.formatSeconds(this.resendSeconds()));

  private completeTimer: ReturnType<typeof setTimeout> | null = null;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private onValidatorChange: () => void = () => undefined;
  private isControlDisabled = false;
  private hasView = false;

  ngAfterViewInit(): void {
    this.hasView = true;
  }

  ngOnDestroy(): void {
    this.clearCompleteTimer();
  }

  writeValue(value: string | number | null | undefined): void {
    const digits = this.normalizeDigits(value).slice(0, OTP_LENGTH).split('');
    this.digits.set([...digits, ...Array(OTP_LENGTH - digits.length).fill('')]);
    this.onValidatorChange();
  }

  registerOnChange(fn: (value: string) => void): void {
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

  validate(control: AbstractControl): ValidationErrors | null {
    const value = this.normalizeDigits(control.value);
    return value.length === OTP_LENGTH ? null : { otpLength: true };
  }

  inputId(index: number): string {
    return `yep-otp-${index}`;
  }

  isDisabled(): boolean {
    return this.disabled() || this.isControlDisabled || this.status() === 'sending' || this.status() === 'validating';
  }

  handleInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const normalized = this.normalizeDigits(input.value);

    if (!normalized) {
      this.setDigit(index, '');
      return;
    }

    if (normalized.length > 1) {
      this.applyCode(normalized, index);
      return;
    }

    this.setDigit(index, normalized.at(-1) ?? '');
    this.focusInput(index + 1);
  }

  handleKeydown(event: KeyboardEvent, index: number): void {
    if (event.key !== 'Backspace') return;

    const currentDigits = this.digits();
    if (currentDigits[index]) {
      this.setDigit(index, '');
      event.preventDefault();
      return;
    }

    if (index > 0) {
      this.focusInput(index - 1);
      event.preventDefault();
    }
  }

  handlePaste(event: ClipboardEvent, index: number): void {
    const pasted = this.normalizeDigits(event.clipboardData?.getData('text') ?? '');
    if (!pasted) return;

    event.preventDefault();
    this.applyCode(pasted, index);
  }

  handleFocus(index: number): void {
    this.focusedIndex.set(index);
  }

  handleBlur(): void {
    this.focusedIndex.set(null);
    this.onTouched();
  }

  requestResend(): void {
    if (this.resendSeconds() > 0 || this.isDisabled()) return;
    this.resendRequested.emit();
  }

  private applyCode(value: string, startIndex: number): void {
    const nextDigits = [...this.digits()];
    value
      .slice(0, OTP_LENGTH - startIndex)
      .split('')
      .forEach((digit, offset) => {
        nextDigits[startIndex + offset] = digit;
      });

    this.updateDigits(nextDigits);
    const nextFocusIndex = Math.min(startIndex + value.length, OTP_LENGTH - 1);
    this.focusInput(this.isComplete() ? OTP_LENGTH - 1 : nextFocusIndex);
  }

  private setDigit(index: number, digit: string): void {
    const nextDigits = [...this.digits()];
    nextDigits[index] = digit;
    this.updateDigits(nextDigits);
  }

  private updateDigits(nextDigits: string[]): void {
    this.digits.set(nextDigits);
    const value = this.value();
    this.onChange(value);
    this.codeChanged.emit(value);
    this.onValidatorChange();

    this.clearCompleteTimer();
    if (value.length === OTP_LENGTH) {
      this.completeTimer = setTimeout(() => this.codeCompleted.emit(value), COMPLETE_DEBOUNCE_MS);
    }
  }

  private focusInput(index: number): void {
    if (!this.hasView || index < 0 || index >= OTP_LENGTH) return;

    setTimeout(() => {
      const input = this.inputRefs?.get(index)?.nativeElement;
      input?.focus();
      input?.select();
    });
  }

  private normalizeDigits(value: string | number | null | undefined): string {
    return String(value ?? '').replace(/\D/g, '');
  }

  private clearCompleteTimer(): void {
    if (!this.completeTimer) return;
    clearTimeout(this.completeTimer);
    this.completeTimer = null;
  }

  private formatSeconds(seconds: number): string {
    const safeSeconds = Math.max(0, seconds);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}
