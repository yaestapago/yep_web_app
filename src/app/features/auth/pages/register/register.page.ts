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
import { Checkbox } from '../../../../shared/ui/checkbox/checkbox';
import {
  PRIVACY_URL,
  TERMS_URL,
  TERMS_VERSION,
} from '../../../../shared/constants/legal.constants';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { BusinessAccountsApiService } from '../../../business/services/business-accounts-api.service';
import { AuthApiService } from '../../services/auth-api.service';
import { MailStatusService } from '../../services/mail-status.service';

interface RegisterFlowResult {
  response: AuthResponse;
  requestedAccess: boolean;
  requestError?: string;
}

type RegisterStep = 'form' | 'code';
type OtpStatus = 'idle' | 'sending' | 'validating' | 'success' | 'error';
type RegisterIdentityControlName = 'email' | 'identificationNumber' | 'cellphoneNumber';

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
    Checkbox,
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
  private readonly notifications = inject(NotificationModalService);
  private readonly mailStatus = inject(MailStatusService);

  readonly mailEnabled = this.mailStatus.enabled;

  readonly termsUrl = TERMS_URL;
  readonly privacyUrl = PRIVACY_URL;

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
      acceptTerms: [false, [Validators.requiredTrue]],
    },
    { validators: [this.passwordsMatchValidator] },
  );

  readonly codeForm = this.fb.group({
    code: ['', [Validators.required]],
  });

  private resendInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.mailStatus.ensureLoaded();

    const code = this.route.snapshot.queryParamMap.get('code')?.trim() ?? '';
    const businessName = this.route.snapshot.queryParamMap.get('businessName')?.trim() ?? '';
    this.inviteCode.set(code.toUpperCase());
    this.inviteBusinessName.set(businessName);

    this.form.controls.email.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.clearServerDuplicateError('email'));
    this.form.controls.identificationNumber.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.clearServerDuplicateError('identificationNumber'));
    this.form.controls.cellphoneNumber.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.clearServerDuplicateError('cellphoneNumber'));
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

    if (!this.mailEnabled()) {
      this.registerWithoutVerification();
      return;
    }

    this.loading.set(true);
    this.otpStatus.set('sending');
    const cellphoneNumber = this.form.controls.cellphoneNumber.value;
    this.authApi
      .requestRegistrationVerificationCode({
        email: this.form.controls.email.value,
        identificationNumber: this.form.controls.identificationNumber.value,
        cellphoneNumber: cellphoneNumber?.e164 ?? '',
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

  /**
   * Registro directo, sin código de verificación por correo: solo se usa
   * cuando el backend reporta SES deshabilitado (ver MailStatusService).
   */
  private registerWithoutVerification(): void {
    this.loading.set(true);

    this.authApi
      .register(this.buildRegisterRequest())
      .pipe(
        switchMap((response) => this.requestStaffAccessFromInvite(response)),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => this.handleRegistrationSuccess(result),
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
        next: (result) => this.handleRegistrationSuccess(result),
        error: (error) => {
          this.otpStatus.set('error');
          const message = httpErrorMessage(error);
          if (this.applyRegistrationConflict(message)) {
            this.step.set('form');
            this.otpStatus.set('idle');
            void this.showRegistrationConflictFeedback(message);
            return;
          }

          this.otpError.set(message);
        },
      });
  }

  private handleRegistrationSuccess(result: RegisterFlowResult): void {
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
  }

  handleCodeChanged(value: string): void {
    if (value.length < 6 && (this.otpStatus() === 'error' || this.otpStatus() === 'success')) {
      this.otpStatus.set('idle');
      this.otpError.set('');
    }
  }

  /**
   * Sale del contexto de invitación (código/link/QR) sin cancelarla en el
   * servidor: el código sigue siendo válido si el usuario vuelve a usarlo.
   * Solo limpia el estado local y vuelve al login sin query params.
   */
  exitInvite(): void {
    this.inviteCode.set('');
    this.inviteBusinessName.set('');
    void this.router.navigate(['/login']);
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

  emailError(): string {
    if (this.form.controls.email.hasError('serverBlockedEmailDomain')) {
      return 'Usa un correo personal o corporativo válido.';
    }

    if (this.form.controls.email.hasError('serverDuplicate')) {
      return 'Ya existe una cuenta con este correo.';
    }

    return 'Ingresa un correo válido.';
  }

  identificationNumberError(): string {
    if (this.form.controls.identificationNumber.hasError('serverDuplicate')) {
      return 'Ya existe una cuenta con esta identificación.';
    }

    return 'Ingresa tu número de identificación.';
  }

  cellphoneNumberError(): string {
    if (this.form.controls.cellphoneNumber.hasError('serverDuplicate')) {
      return 'Ya existe una cuenta con este celular.';
    }

    return 'Ingresa tu celular.';
  }

  private passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;

    if (!password || !confirmPassword) return null;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  private handleRegisterError(error: unknown): void {
    const message = httpErrorMessage(error);

    const hasRegistrationConflict = this.applyRegistrationConflict(message);

    if (hasRegistrationConflict) {
      void this.showRegistrationConflictFeedback(message);
      return;
    }

    this.error.set(message);
  }

  private isExistingEmailError(message: string): boolean {
    return message.toLowerCase().includes('ya existe un usuario con este email');
  }

  private isBlockedEmailDomainError(message: string): boolean {
    const normalizedMessage = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

    return (
      normalizedMessage.includes('correos temporales') ||
      normalizedMessage.includes('correo personal o corporativo')
    );
  }

  private applyRegistrationConflict(message: string): boolean {
    const controlName = this.registrationConflictControl(message);
    if (!controlName) {
      return false;
    }

    const control = this.form.controls[controlName];
    const errorKey =
      controlName === 'email' && this.isBlockedEmailDomainError(message)
        ? 'serverBlockedEmailDomain'
        : 'serverDuplicate';
    control.setErrors({ ...(control.errors ?? {}), [errorKey]: true });
    control.markAsTouched();
    return true;
  }

  private async showRegistrationConflictFeedback(message: string): Promise<void> {
    if (this.isExistingEmailError(message)) {
      const goToLogin = await this.notifications.confirm({
        title: 'Ya tienes una cuenta',
        message:
          'Encontramos una cuenta registrada con este correo. Inicia sesión para continuar.',
        type: 'warning',
        confirmText: 'Iniciar sesión',
        cancelText: 'Ok',
      });
      if (goToLogin) {
        await this.router.navigate(['/login'], {
          queryParams: this.loginQueryParams(),
        });
      }
      return;
    }

    const controlName = this.registrationConflictControl(message);
    await this.notifications.error({
      title: this.registrationConflictTitle(controlName),
      message: this.registrationConflictMessage(controlName),
      confirmText: 'Revisar datos',
    });
  }

  private registrationConflictTitle(controlName: RegisterIdentityControlName | null): string {
    switch (controlName) {
      case 'email':
        return 'Correo no permitido';
      case 'identificationNumber':
        return 'Identificación ya registrada';
      case 'cellphoneNumber':
        return 'Celular ya registrado';
      default:
        return 'No pudimos continuar el registro';
    }
  }

  private registrationConflictMessage(controlName: RegisterIdentityControlName | null): string {
    switch (controlName) {
      case 'email':
        return 'No aceptamos correos temporales. Usa un correo personal o corporativo para crear tu cuenta.';
      case 'identificationNumber':
        return 'Ya existe una cuenta con este número de identificación. Revisa el dato o inicia sesión si la cuenta es tuya.';
      case 'cellphoneNumber':
        return 'Ya existe una cuenta con este celular. Revisa el número o inicia sesión si la cuenta es tuya.';
      default:
        return 'Ya existe una cuenta con estos datos. Revisa la información antes de intentarlo de nuevo.';
    }
  }

  private registrationConflictControl(message: string): RegisterIdentityControlName | null {
    const normalizedMessage = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

    if (normalizedMessage.includes('email') || normalizedMessage.includes('correo')) {
      return 'email';
    }

    if (
      normalizedMessage.includes('identificacion') ||
      normalizedMessage.includes('documento')
    ) {
      return 'identificationNumber';
    }

    if (
      normalizedMessage.includes('telefono') ||
      normalizedMessage.includes('celular') ||
      normalizedMessage.includes('phone')
    ) {
      return 'cellphoneNumber';
    }

    return null;
  }

  private clearServerDuplicateError(controlName: RegisterIdentityControlName): void {
    const control = this.form.controls[controlName];
    const errors = control.errors;
    if (!errors?.['serverDuplicate'] && !errors?.['serverBlockedEmailDomain']) {
      return;
    }

    const {
      serverDuplicate: _serverDuplicate,
      serverBlockedEmailDomain: _serverBlockedEmailDomain,
      ...remainingErrors
    } = errors;
    control.setErrors(Object.keys(remainingErrors).length ? remainingErrors : null);
  }

  private buildRegisterRequest(verificationCode?: string): RegisterRequest {
    const {
      confirmPassword: _confirmPassword,
      acceptTerms: _acceptTerms,
      cellphoneNumber,
      ...rawRequest
    } = this.form.getRawValue();

    return {
      ...rawRequest,
      cellphoneNumber: cellphoneNumber?.e164 ?? '',
      ...(verificationCode ? { verificationCode } : {}),
      acceptedTerms: true,
      termsVersion: TERMS_VERSION,
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
