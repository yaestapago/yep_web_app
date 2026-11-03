import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideLogOut, LucideTrash2, LucideTriangleAlert } from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { AccountDeletionPreviewResponse } from '../../../../shared/models/auth.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Card } from '../../../../shared/ui/card/card';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { OtpInput } from '../../../../shared/ui/otp-input/otp-input';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AuthApiService } from '../../../auth/services/auth-api.service';

type DeleteAccountStep = 'notice' | 'password' | 'code';
type OtpStatus = 'idle' | 'sending' | 'validating' | 'success' | 'error';

/**
 * Zona de peligro con "Eliminar cuenta": aviso con lo que pasa con cada negocio,
 * contraseña y código por correo. Mismo flujo y componentes que "Eliminar negocio"
 * en `BusinessDataSection`. Vive aparte porque se muestra en Configuración y en el
 * onboarding: un usuario sin negocio aprobado no puede entrar a Configuración.
 */
@Component({
  selector: 'app-delete-account-card',
  imports: [
    ReactiveFormsModule,
    Alert,
    Button,
    Card,
    Input,
    Modal,
    OtpInput,
    LucideLogOut,
    LucideTrash2,
    LucideTriangleAlert,
  ],
  templateUrl: './delete-account-card.html',
  styleUrl: './delete-account-card.scss',
})
export class DeleteAccountCard implements OnDestroy {
  private readonly authApi = inject(AuthApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notificationModal = inject(NotificationModalService);
  private readonly router = inject(Router);

  private readonly otpInput = viewChild(OtpInput);

  readonly email = computed(() => this.session.user()?.email ?? '');

  /** El backend respondió 403 aunque la sesión no diga que es una cuenta de soporte. */
  private readonly forbidden = signal(false);
  readonly canDelete = computed(() => !this.session.isSupportUser() && !this.forbidden());

  readonly loadingPreview = signal(false);
  readonly previewError = signal('');
  readonly preview = signal<AccountDeletionPreviewResponse | null>(null);

  readonly modalOpen = signal(false);
  readonly step = signal<DeleteAccountStep>('notice');
  readonly deleting = signal(false);
  readonly passwordError = signal('');
  readonly otpStatus = signal<OtpStatus>('idle');
  readonly otpError = signal('');
  readonly resendSeconds = signal(0);

  readonly passwordForm = this.fb.group({
    password: ['', Validators.required],
  });

  private resendInterval: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    this.clearResendTimer();
  }

  /** Pide el preview antes de abrir: sin saber qué se borra no se ofrece seguir. */
  start(): void {
    if (this.loadingPreview()) {
      return;
    }

    this.loadingPreview.set(true);
    this.previewError.set('');

    this.authApi
      .previewAccountDeletion()
      .pipe(
        finalize(() => this.loadingPreview.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (preview) => {
          this.preview.set(preview);
          this.resetFlow();
          this.modalOpen.set(true);
        },
        error: (error) => {
          if (!this.handleForbidden(error)) {
            this.previewError.set(this.tooManyAttemptsMessage(error) ?? httpErrorMessage(error));
          }
        },
      });
  }

  continueToPassword(): void {
    this.step.set('password');
  }

  close(): void {
    if (this.deleting()) {
      return;
    }
    this.clearResendTimer();
    this.passwordForm.reset({ password: '' });
    this.modalOpen.set(false);
  }

  passwordFieldError(): string {
    const control = this.passwordForm.controls.password;
    if (control.invalid && (control.touched || control.dirty)) {
      return 'Escribe tu contraseña.';
    }
    return this.passwordError();
  }

  submitPassword(): void {
    if (this.deleting()) {
      return;
    }
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.deleting.set(true);
    this.passwordError.set('');

    this.requestCode().subscribe({
      next: (response) => {
        this.step.set('code');
        this.otpStatus.set('idle');
        this.otpError.set('');
        this.startResendTimer(response.resendInSeconds ?? 60);
      },
      error: (error) => {
        if (!this.handleForbidden(error)) {
          this.passwordError.set(this.requestErrorMessage(error));
        }
      },
    });
  }

  resendCode(): void {
    if (this.resendSeconds() > 0 || this.deleting()) {
      return;
    }

    this.deleting.set(true);
    this.otpStatus.set('sending');
    this.otpError.set('');

    this.requestCode().subscribe({
      next: (response) => {
        // El código anterior ya no sirve: se limpian las casillas para escribir el nuevo.
        this.otpInput()?.writeValue('');
        this.otpStatus.set('idle');
        this.startResendTimer(response.resendInSeconds ?? 60);
      },
      error: (error) => {
        if (!this.handleForbidden(error)) {
          this.otpStatus.set('error');
          this.otpError.set(this.requestErrorMessage(error));
        }
      },
    });
  }

  confirmCode(code: string): void {
    if (this.otpStatus() === 'validating' || this.otpStatus() === 'success') {
      return;
    }

    this.otpError.set('');
    this.otpStatus.set('validating');
    this.deleting.set(true);

    // Sin `takeUntilDestroyed`: si la persona navega mientras se confirma, la cuenta igual se
    // elimina y la sesión local se tiene que limpiar.
    this.authApi
      .confirmAccountDeletion(code)
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        next: () => this.finishDeletion(),
        error: (error) => {
          if (!this.handleForbidden(error)) {
            this.otpStatus.set('error');
            this.otpError.set(this.confirmErrorMessage(error));
          }
        },
      });
  }

  handleCodeChanged(value: string): void {
    if (value.length < 6 && this.otpStatus() === 'error') {
      this.otpStatus.set('idle');
      this.otpError.set('');
    }
  }

  private requestCode() {
    return this.authApi
      .requestAccountDeletion(this.passwordForm.getRawValue().password)
      .pipe(
        finalize(() => this.deleting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      );
  }

  /** Igual que el cierre de sesión: limpia la sesión local y lleva a login. */
  private finishDeletion(): void {
    this.otpStatus.set('success');
    this.clearResendTimer();
    this.passwordForm.reset({ password: '' });
    this.modalOpen.set(false);
    this.session.clearSession();
    void this.router.navigateByUrl('/login');
    void this.notificationModal.success({
      title: 'Cuenta eliminada',
      message: 'Eliminamos tu cuenta de YEP. Si algún día quieres volver, puedes crear una nueva.',
    });
  }

  /** 403: es una cuenta de soporte. Se cierra el flujo y la tarjeta muestra el mensaje. */
  private handleForbidden(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse) || error.status !== 403) {
      return false;
    }
    this.forbidden.set(true);
    this.clearResendTimer();
    this.passwordForm.reset({ password: '' });
    this.modalOpen.set(false);
    return true;
  }

  private requestErrorMessage(error: unknown): string {
    return (
      this.tooManyAttemptsMessage(error) ??
      (this.isRejectedInput(error)
        ? 'La contraseña no es correcta. Revísala e inténtalo de nuevo.'
        : httpErrorMessage(error))
    );
  }

  private confirmErrorMessage(error: unknown): string {
    return (
      this.tooManyAttemptsMessage(error) ??
      (this.isRejectedInput(error)
        ? 'El código no es correcto o ya venció. Revísalo o pide uno nuevo.'
        : httpErrorMessage(error))
    );
  }

  private isRejectedInput(error: unknown): boolean {
    return error instanceof HttpErrorResponse && (error.status === 400 || error.status === 401);
  }

  private tooManyAttemptsMessage(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse) || error.status !== 429) {
      return null;
    }
    const seconds = Number(error.error?.retryAfterSeconds);
    if (seconds > 0) {
      const minutes = Math.ceil(seconds / 60);
      return `Hiciste demasiados intentos. Vuelve a intentarlo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
    }
    return 'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.';
  }

  private resetFlow(): void {
    this.passwordForm.reset({ password: '' });
    this.step.set('notice');
    this.passwordError.set('');
    this.otpStatus.set('idle');
    this.otpError.set('');
    this.clearResendTimer();
    this.resendSeconds.set(0);
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
}
