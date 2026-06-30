import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideLogIn } from '@lucide/angular';
import { Observable, catchError, finalize, map, of, switchMap } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { AuthResponse, BusinessMembership } from '../../../../shared/models/auth.models';
import { Alert, Button, Input } from '../../../../shared/ui';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../../business/services/business-accounts-api.service';
import { AuthApiService } from '../../services/auth-api.service';

interface LoginFlowResult {
  response: AuthResponse;
  requestedAccess: boolean;
  requestError?: string;
}

@Component({
  selector: 'app-login-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LucideLogIn, Alert, Button, Input],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
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
  readonly registerQueryParams = computed(() => {
    const code = this.inviteCode();
    const businessName = this.inviteBusinessName();
    return {
      ...(code ? { code } : {}),
      ...(businessName ? { businessName } : {}),
    };
  });

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

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

    this.loading.set(true);
    this.authApi
      .login(this.form.getRawValue())
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
              ? `Bienvenido, ${result.response.user.firstName}. Solicitud enviada al negocio.`
              : `Bienvenido, ${result.response.user.firstName}.`,
          );
          setTimeout(
            () =>
              void this.router.navigateByUrl(
                this.session.onboardingRequired() ? '/onboarding' : '/dashboard',
              ),
            350,
          );
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  isInvalid(controlName: 'email' | 'password'): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  private requestStaffAccessFromInvite(response: AuthResponse): Observable<LoginFlowResult> {
    this.session.saveSession(response);
    const code = this.inviteCode();

    if (!code) {
      return of({ response, requestedAccess: false } satisfies LoginFlowResult);
    }

    return this.businessApi.lookupBusinessByCode(code).pipe(
      switchMap((lookup) => {
        const matches = lookup.businessAccounts;
        if (matches.length === 0) {
          return of({
            response,
            requestedAccess: false,
            requestError: 'No encontramos el negocio asociado al link de registro.',
          } satisfies LoginFlowResult);
        }

        if (matches.length > 1) {
          return of({
            response,
            requestedAccess: false,
            requestError:
              'El link coincide con más de un negocio. Solicita un nuevo link al propietario.',
          } satisfies LoginFlowResult);
        }

        const existingMembership = this.session
          .memberships()
          .find((membership) => membership.businessAccountId === matches[0].id);
        if (existingMembership) {
          return of({
            response,
            requestedAccess: existingMembership.status === 'pending',
          } satisfies LoginFlowResult);
        }

        return this.businessApi
          .requestMembership({
            businessAccountId: matches[0].id,
            role: 'account_staff',
          })
          .pipe(
            map((membershipResponse) => {
              this.session.updateMemberships(this.mergeMembership(membershipResponse.membership));
              return { response, requestedAccess: true } satisfies LoginFlowResult;
            }),
          );
      }),
      catchError((error) =>
        of({
          response,
          requestedAccess: false,
          requestError: `No pudimos enviar la solicitud al negocio. ${httpErrorMessage(error)}`,
        } satisfies LoginFlowResult),
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
