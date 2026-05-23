import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideBuilding2,
  LucideCheckCircle2,
  LucideCircleDot,
  LucideLoaderCircle,
  LucideRefreshCw,
  LucideSend,
  LucideTriangleAlert,
} from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { BusinessMembership } from '../../../../shared/models/auth.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

@Component({
  selector: 'app-onboarding-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LucideBuilding2,
    LucideCheckCircle2,
    LucideCircleDot,
    LucideLoaderCircle,
    LucideRefreshCw,
    LucideSend,
    LucideTriangleAlert,
  ],
  templateUrl: './onboarding.page.html',
  styleUrl: './onboarding.page.scss',
})
export class OnboardingPage implements OnInit {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly user = this.session.user;
  readonly approvedMemberships = this.session.approvedMemberships;
  readonly pendingMemberships = this.session.pendingMemberships;
  readonly activeBusinessAccountId = this.session.activeBusinessAccountId;

  readonly loadingMemberships = signal(false);
  readonly creatingBusiness = signal(false);
  readonly requestingAccess = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  readonly businessForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    city: ['', [Validators.required, Validators.minLength(2)]],
    address: ['', [Validators.required, Validators.minLength(4)]],
    phone: ['', [Validators.required, Validators.minLength(7)]],
  });

  readonly requestForm = this.fb.group({
    businessAccountId: ['', [Validators.required, Validators.minLength(24)]],
  });

  ngOnInit(): void {
    this.loadMemberships();
  }

  loadMemberships(): void {
    this.loadingMemberships.set(true);
    this.error.set('');

    this.businessApi
      .listMemberships()
      .pipe(
        finalize(() => this.loadingMemberships.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.session.updateMemberships(response.memberships),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  createBusiness(): void {
    this.error.set('');
    this.success.set('');

    if (this.businessForm.invalid) {
      this.businessForm.markAllAsTouched();
      return;
    }

    this.creatingBusiness.set(true);
    this.businessApi
      .createBusinessAccount(this.businessForm.getRawValue())
      .pipe(
        finalize(() => this.creatingBusiness.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          const membership = {
            ...response.membership,
            businessAccount: response.membership.businessAccount ?? response.businessAccount,
          };

          this.session.updateMemberships(this.mergeMembership(membership));
          this.session.setActiveBusinessAccountId(response.businessAccount.id);
          this.success.set(`Negocio activo: ${response.businessAccount.name}.`);
          this.businessForm.reset();
          void this.router.navigateByUrl('/dashboard');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  requestAccess(): void {
    this.error.set('');
    this.success.set('');

    if (this.requestForm.invalid) {
      this.requestForm.markAllAsTouched();
      return;
    }

    this.requestingAccess.set(true);
    this.businessApi
      .requestMembership({
        businessAccountId: this.requestForm.controls.businessAccountId.value.trim(),
        role: 'account_staff',
      })
      .pipe(
        finalize(() => this.requestingAccess.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.session.updateMemberships(this.mergeMembership(response.membership));
          this.requestForm.reset();

          if (response.membership.status === 'approved') {
            this.session.setActiveBusinessAccountId(response.membership.businessAccountId);
            this.success.set('Acceso aprobado. Negocio activo seleccionado.');
            void this.router.navigateByUrl('/dashboard');
            return;
          }

          this.success.set('Solicitud enviada. Un owner debe aprobar el acceso.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  selectBusiness(membership: BusinessMembership): void {
    this.session.setActiveBusinessAccountId(membership.businessAccountId);
    void this.router.navigateByUrl('/dashboard');
  }

  businessName(membership: BusinessMembership): string {
    return membership.businessAccount?.name ?? membership.businessAccountId;
  }

  isBusinessInvalid(controlName: keyof typeof this.businessForm.controls): boolean {
    const control = this.businessForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  isRequestInvalid(): boolean {
    const control = this.requestForm.controls.businessAccountId;
    return control.invalid && (control.dirty || control.touched);
  }

  private mergeMembership(membership: BusinessMembership): BusinessMembership[] {
    const memberships = this.session.memberships();
    const existingIndex = memberships.findIndex((current) => current.id === membership.id);

    if (existingIndex === -1) {
      return [membership, ...memberships];
    }

    return memberships.map((current, index) => (index === existingIndex ? membership : current));
  }
}
