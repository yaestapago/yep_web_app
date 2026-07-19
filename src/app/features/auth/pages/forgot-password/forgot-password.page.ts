import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { LucideMail } from '@lucide/angular';
import { finalize } from 'rxjs';

import { Alert, Button, Input, OtpInput } from '../../../../shared/ui';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AuthApiService } from '../../services/auth-api.service';
import { MailStatusService } from '../../services/mail-status.service';

type ForgotPasswordStep = 'email' | 'code';
type OtpStatus = 'idle' | 'sending' | 'validating' | 'success' | 'error';

@Component({
  selector: 'app-forgot-password-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LucideMail, Alert, Button, Input, OtpInput],
  templateUrl: './forgot-password.page.html',
  styleUrl: './forgot-password.page.scss',
})
export class ForgotPasswordPage implements OnDestroy {
  private readonly authApi = inject(AuthApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly router = inject(Router);
  private readonly mailStatus = inject(MailStatusService);

  readonly mailEnabled = this.mailStatus.enabled;
  readonly step = signal<ForgotPasswordStep>('email');
  readonly loading = signal(false);
  readonly otpStatus = signal<OtpStatus>('idle');
  readonly error = signal('');
  readonly success = signal('');
  readonly otpError = signal('');
  readonly resendSeconds = signal(0);
  readonly maskedEmail = computed(() => this.maskEmail(this.emailForm.controls.email.value));

  readonly emailForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  readonly codeForm = this.fb.group({
    code: ['', [Validators.required]],
  });

  private resendInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.mailStatus.ensureLoaded();
  }

  ngOnDestroy(): void {
    this.clearResendTimer();
  }

  requestCode(): void {
    this.error.set('');
    this.success.set('');

    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.otpStatus.set('sending');
    this.authApi
      .requestPasswordResetCode(this.emailForm.getRawValue())
      .pipe(
        finalize(() => {
          this.loading.set(false);
          if (this.otpStatus() === 'sending') this.otpStatus.set('idle');
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.step.set('code');
          this.codeForm.reset();
          this.success.set(response.message ?? 'Te enviamos un código de 6 dígitos.');
          this.startResendTimer(response.resendInSeconds ?? 60);
        },
        error: (error) => {
          this.otpStatus.set('idle');
          this.error.set(httpErrorMessage(error));
        },
      });
  }

  resendCode(): void {
    if (this.resendSeconds() > 0 || this.loading()) return;
    this.requestCode();
  }

  verifyCode(code: string): void {
    if (code.length !== 6 || this.otpStatus() === 'validating' || this.otpStatus() === 'success') return;

    this.error.set('');
    this.success.set('');
    this.otpError.set('');
    this.otpStatus.set('validating');

    this.authApi
      .verifyPasswordResetCode({
        email: this.emailForm.controls.email.value,
        code,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.otpStatus.set('success');
          void this.router.navigate(['/reset-password'], {
            queryParams: {
              token: response.resetToken,
              email: this.emailForm.controls.email.value,
            },
          });
        },
        error: (error) => {
          this.otpStatus.set('error');
          this.otpError.set(httpErrorMessage(error));
        },
      });
  }

  handleCodeChanged(value: string): void {
    if (value.length < 6 && (this.otpStatus() === 'error' || this.otpStatus() === 'success')) {
      this.otpStatus.set('idle');
      this.otpError.set('');
    }
  }

  isEmailInvalid(): boolean {
    const control = this.emailForm.controls.email;
    return control.invalid && (control.dirty || control.touched);
  }

  editEmail(): void {
    this.step.set('email');
    this.codeForm.reset();
    this.error.set('');
    this.success.set('');
    this.otpError.set('');
    this.otpStatus.set('idle');
  }

  private startResendTimer(seconds: number): void {
    this.clearResendTimer();
    this.resendSeconds.set(Math.max(0, seconds));

    this.resendInterval = setInterval(() => {
      const nextSeconds = Math.max(0, this.resendSeconds() - 1);
      this.resendSeconds.set(nextSeconds);
      if (nextSeconds === 0) this.clearResendTimer();
    }, 1000);
  }

  private clearResendTimer(): void {
    if (!this.resendInterval) return;
    clearInterval(this.resendInterval);
    this.resendInterval = null;
  }

  private maskEmail(email: string): string {
    const [name = '', domain = ''] = email.split('@');
    if (!name || !domain) return email;

    const visible = name.slice(0, Math.min(3, name.length));
    return `${visible}${'*'.repeat(Math.max(3, name.length - visible.length))}@${domain}`;
  }
}
