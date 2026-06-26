import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideUserPlus } from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { RegisterRequest } from '../../../../shared/models/auth.models';
import { Alert, Button, Input, PhoneInput, type PhoneInputValue } from '../../../../shared/ui';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AuthApiService } from '../../services/auth-api.service';

@Component({
  selector: 'app-register-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    LucideUserPlus,
    Alert,
    Button,
    Input,
    PhoneInput,
  ],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
})
export class RegisterPage {
  private readonly authApi = inject(AuthApiService);
  private readonly session = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  readonly form = this.fb.group(
    {
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      identificationNumber: ['', [Validators.required, Validators.minLength(5)]],
      cellphoneNumber: this.fb.control<PhoneInputValue | null>(null, [Validators.required]),
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [this.passwordsMatchValidator] },
  );

  submit(): void {
    this.error.set('');
    this.success.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const {
      confirmPassword: _confirmPassword,
      cellphoneNumber,
      ...rawRequest
    } = this.form.getRawValue();
    const request = {
      ...rawRequest,
      cellphoneNumber: cellphoneNumber?.e164 ?? '',
    };

    this.loading.set(true);
    this.authApi
      .register(request satisfies RegisterRequest)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.session.saveSession(response);
          this.success.set(`Cuenta creada para ${response.user.firstName}.`);
          setTimeout(
            () =>
              void this.router.navigateByUrl(
                this.session.onboardingRequired() ? '/onboarding' : '/dashboard',
              ),
            450,
          );
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    const hasMismatch = controlName === 'confirmPassword' && this.form.hasError('passwordMismatch');
    return (control.invalid || hasMismatch) && (control.dirty || control.touched);
  }

  confirmPasswordError(): string {
    if (this.form.controls.confirmPassword.hasError('required')) return 'Confirma tu contraseña.';
    if (this.form.hasError('passwordMismatch')) return 'Las contraseñas no coinciden.';
    return '';
  }

  private passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;

    if (!password || !confirmPassword) return null;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }
}
