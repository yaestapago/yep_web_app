import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideBuilding2,
  LucideLoaderCircle,
  LucideLogOut,
  LucideTriangleAlert,
} from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { BusinessMembership } from '../../../../shared/models/auth.models';
import type { AddressLocationValue } from '../../../../shared/models/geo.models';
import { AddressLocationSelect } from '../../../../shared/ui/address-location-select/address-location-select';
import { Button } from '../../../../shared/ui/button/button';
import { Modal } from '../../../../shared/ui/modal/modal';
import { PhoneInput, type PhoneInputValue } from '../../../../shared/ui/phone-input/phone-input';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AuthApiService } from '../../../auth/services/auth-api.service';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

@Component({
  selector: 'app-onboarding-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LucideBuilding2,
    LucideLoaderCircle,
    LucideLogOut,
    LucideTriangleAlert,
    AddressLocationSelect,
    Button,
    Modal,
    PhoneInput,
  ],
  templateUrl: './onboarding.page.html',
  styleUrl: './onboarding.page.scss',
})
export class OnboardingPage {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly user = this.session.user;
  readonly creatingBusiness = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  /** Confirmación de cierre de sesión: esta página vive fuera del Shell. */
  readonly logoutModalOpen = signal(false);

  readonly businessForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    location: this.fb.control<AddressLocationValue | null>(null, [Validators.required]),
    address: ['', [Validators.required, Validators.minLength(4)]],
    phone: this.fb.control<PhoneInputValue | string | null>(null, [Validators.required]),
  });

  createBusiness(): void {
    this.error.set('');
    this.success.set('');

    if (this.businessForm.invalid) {
      this.businessForm.markAllAsTouched();
      return;
    }

    const raw = this.businessForm.getRawValue();
    this.creatingBusiness.set(true);
    this.businessApi
      .createBusinessAccount({
        name: raw.name,
        departmentCode: raw.location?.departmentCode ?? '',
        departmentName: raw.location?.departmentName ?? '',
        cityCode: raw.location?.cityCode ?? '',
        cityName: raw.location?.cityName ?? '',
        address: raw.address,
        phone: this.phoneValue(raw.phone),
      })
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
          this.success.set(`Negocio creado: ${response.businessAccount.name}.`);
          this.businessForm.reset();
          void this.router.navigate(['/businesses', response.businessAccount.id, 'business-data']);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  // --- Cerrar sesión ---------------------------------------------------------
  // Esta página vive fuera del Shell (un usuario sin negocio aprobado no tiene
  // sidebar), así que necesita su propia salida para no quedar atrapado aquí.

  openLogout(): void {
    this.logoutModalOpen.set(true);
  }

  cancelLogout(): void {
    this.logoutModalOpen.set(false);
  }

  confirmLogout(): void {
    this.logoutModalOpen.set(false);
    this.authApi
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.finishLogout(),
        error: () => this.finishLogout(),
      });
  }

  private finishLogout(): void {
    this.session.clearSession();
    void this.router.navigateByUrl('/login');
  }

  isBusinessInvalid(controlName: keyof typeof this.businessForm.controls): boolean {
    const control = this.businessForm.controls[controlName];
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

  private phoneValue(value: PhoneInputValue | string | null): string {
    if (!value) {
      return '';
    }
    return typeof value === 'string' ? value : value.e164;
  }
}
