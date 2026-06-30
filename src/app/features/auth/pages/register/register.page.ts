import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideMail } from '@lucide/angular';
import { Observable, catchError, finalize, map, of, switchMap } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type {
  AuthResponse,
  BusinessMembership,
  RegisterRequest,
} from '../../../../shared/models/auth.models';
import {
  Alert,
  Button,
  Input,
  OtpInput,
  PhoneInput,
  type PhoneInputValue,
} from '../../../../shared/ui';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../../business/services/business-accounts-api.service';
import { AuthApiService } from '../../services/auth-api.service';

interface RegisterFlowResult {
  response: AuthResponse;
  requestedAccess: boolean;
  requestError?: string;
}

type RegisterStep = 'form' | 'code';
type OtpStatus = 'idle' | 'sending' | 'validating' | 'success' | 'error';

@Component({
  selector: 'app-register-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    LucideMail,
    Alert,
    Button,
    Input,
    OtpInput,
    PhoneInput,
  ],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
})
export class RegisterPage implements OnDestroy {
  private readonly authApi = inject(AuthApiService);
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly loading = signal(false);
  readonly step = signal<RegisterStep>('form');
  readonly otpStatus = signal<OtpStatus>('idle');
  readonly error = signal('');
  readonly success = signal('');
  readonly otpError = signal('');
  readonly resendSeconds = signal(0);
  readonly inviteCode = signal('');
  readonly inviteBusinessName = signal('');
  readonly maskedEmail = computed(() => this.maskEmail(this.form.controls.email.value));
  readonly loginQueryParams = computed(() => {
    const code = this.inviteCode();
    const businessName = this.inviteBusinessName();
    return {
      ...(code ? { code } : {}),
      ...(businessName ? { businessName } : {}),
    };
  });

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

  readonly codeForm = this.fb.group({
    code: ['', [Validators.required]],
  });

  private resendInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const code = this.route.snapshot.queryParamMap.get('code')?.trim() ?? '';
    const businessName = this.route.snapshot.queryParamMap.get('businessName')?.trim() ?? '';
    this.inviteCode.set(code.toUpperCase());
    this.inviteBusinessName.set(businessName);
  }

  ngOnDestroy(): void {
    this.clearResendTimer();
  }

  submit(): void {
    this.error.set('');
    this.success.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.otpStatus.set('sending');
    this.authApi
      .requestRegistrationVerificationCode({
        email: this.form.controls.email.value,
        identificationNumber: this.form.controls.identificationNumber.value,
      })
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
          this.otpError.set('');
          this.success.set(response.message ?? 'Te enviamos un código de 6 dígitos.');
          this.startResendTimer(response.resendInSeconds ?? 60);
        },
        error: (error) => this.handleRegisterError(error),
      });
  }

  resendCode(): void {
    if (this.resendSeconds() > 0 || this.loading()) return;
    this.submit();
  }

  completeRegistration(code: string): void {
    if (code.length !== 6 || this.otpStatus() === 'validating' || this.otpStatus() === 'success') {
      return;
    }

    this.error.set('');
    this.success.set('');
    this.otpError.set('');
    this.otpStatus.set('validating');
    this.loading.set(true);

    this.authApi
      .register(this.buildRegisterRequest(code))
      .pipe(
        switchMap((response) => this.requestStaffAccessFromInvite(response)),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.otpStatus.set('success');
          if (result.requestError) {
            this.error.set(result.requestError);
          }
          this.success.set(
            result.requestedAccess
              ? `Cuenta creada para ${result.response.user.firstName}. Solicitud enviada al negocio.`
              : `Cuenta creada para ${result.response.user.firstName}.`,
          );
          setTimeout(
            () =>
              void this.router.navigateByUrl(
                this.session.onboardingRequired() ? '/onboarding' : '/dashboard',
              ),
            450,
          );
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

  editForm(): void {
    this.step.set('form');
    this.codeForm.reset();
    this.error.set('');
    this.success.set('');
    this.otpError.set('');
    this.otpStatus.set('idle');
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

  private handleRegisterError(error: unknown): void {
    const message = httpErrorMessage(error);
    this.error.set(message);

    if (!this.isExistingEmailError(message)) {
      return;
    }

    this.success.set('Ya tienes una cuenta. Te llevaremos al inicio de sesión.');
    setTimeout(
      () =>
        void this.router.navigate(['/login'], {
          queryParams: this.loginQueryParams(),
        }),
      1000,
    );
  }

  private isExistingEmailError(message: string): boolean {
    return message.toLowerCase().includes('ya existe un usuario con este email');
  }

  private buildRegisterRequest(verificationCode: string): RegisterRequest {
    const {
      confirmPassword: _confirmPassword,
      cellphoneNumber,
      ...rawRequest
    } = this.form.getRawValue();

    return {
      ...rawRequest,
      cellphoneNumber: cellphoneNumber?.e164 ?? '',
      verificationCode,
    };
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

  private requestStaffAccessFromInvite(response: AuthResponse): Observable<RegisterFlowResult> {
    this.session.saveSession(response);
    const code = this.inviteCode();

    if (!code) {
      return of({ response, requestedAccess: false } satisfies RegisterFlowResult);
    }

    return this.businessApi.lookupBusinessByCode(code).pipe(
      switchMap((lookup) => {
        const matches = lookup.businessAccounts;
        if (matches.length === 0) {
          return of({
            response,
            requestedAccess: false,
            requestError:
              'Cuenta creada, pero no encontramos el negocio asociado al link de registro.',
          } satisfies RegisterFlowResult);
        }

        if (matches.length > 1) {
          return of({
            response,
            requestedAccess: false,
            requestError:
              'Cuenta creada, pero el link coincide con mas de un negocio. Solicita un nuevo link al propietario.',
          } satisfies RegisterFlowResult);
        }

        return this.businessApi
          .requestMembership({
            businessAccountId: matches[0].id,
            role: 'account_staff',
          })
          .pipe(
            map((membershipResponse) => {
              this.session.updateMemberships(this.mergeMembership(membershipResponse.membership));
              return { response, requestedAccess: true } satisfies RegisterFlowResult;
            }),
          );
      }),
      catchError((error) =>
        of({
          response,
          requestedAccess: false,
          requestError: `Cuenta creada, pero no pudimos enviar la solicitud al negocio. ${httpErrorMessage(error)}`,
        } satisfies RegisterFlowResult),
      ),
    );
  }

  private mergeMembership(membership: BusinessMembership): BusinessMembership[] {
    const memberships = this.session.memberships();
    const index = memberships.findIndex((current) => current.id === membership.id);

    if (index === -1) {
      return [membership, ...memberships];
    }

    return memberships.map((current, i) => (i === index ? membership : current));
  }
}
