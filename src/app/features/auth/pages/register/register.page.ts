import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideUserPlus } from '@lucide/angular';
import { Observable, catchError, finalize, map, of, switchMap } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type {
  AuthResponse,
  BusinessMembership,
  RegisterRequest,
} from '../../../../shared/models/auth.models';
import { Alert, Button, Input, PhoneInput, type PhoneInputValue } from '../../../../shared/ui';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../../business/services/business-accounts-api.service';
import { AuthApiService } from '../../services/auth-api.service';

interface RegisterFlowResult {
  response: AuthResponse;
  requestedAccess: boolean;
  requestError?: string;
}

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
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly inviteCode = signal('');
  readonly inviteBusinessName = signal('');
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

  constructor() {
    const code = this.route.snapshot.queryParamMap.get('code')?.trim() ?? '';
    const businessName = this.route.snapshot.queryParamMap.get('businessName')?.trim() ?? '';
    this.inviteCode.set(code.toUpperCase());
    this.inviteBusinessName.set(businessName);
  }

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
        switchMap((response) => this.requestStaffAccessFromInvite(response)),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
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
        error: (error) => this.handleRegisterError(error),
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
