import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideKeyRound } from '@lucide/angular';
import { finalize } from 'rxjs';

import { Alert, Button, Input } from '../../../../shared/ui';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AuthApiService } from '../../services/auth-api.service';

@Component({
  selector: 'app-reset-password-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LucideKeyRound, Alert, Button, Input],
  templateUrl: './reset-password.page.html',
  styleUrl: './reset-password.page.scss',
})
export class ResetPasswordPage {
  private readonly authApi = inject(AuthApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly email = this.route.snapshot.queryParamMap.get('email') ?? '';
  private readonly resetToken = this.route.snapshot.queryParamMap.get('token') ?? '';

  readonly form = this.fb.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [this.passwordsMatchValidator] },
  );

  submit(): void {
    this.error.set('');
    this.success.set('');

    if (!this.resetToken) {
      this.error.set('El enlace para restablecer la contraseña no es válido o expiró.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.authApi
      .resetPassword({
        resetToken: this.resetToken,
        password: this.form.controls.password.value,
      })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.form.reset();
          this.success.set(response.message ?? 'Tu contraseña fue actualizada correctamente.');
          setTimeout(() => void this.router.navigateByUrl('/login'), 650);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  isInvalid(controlName: 'password' | 'confirmPassword'): boolean {
    const control = this.form.controls[controlName];
    const hasMismatch = controlName === 'confirmPassword' && this.form.hasError('passwordMismatch');
    return (control.invalid || hasMismatch) && (control.dirty || control.touched);
  }

  confirmPasswordError(): string {
    if (this.form.controls.confirmPassword.hasError('required')) return 'Confirma tu nueva contraseña.';
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
