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
import { BusinessAccount, BusinessMembership } from '../../../../shared/models/auth.models';
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
  readonly knownBusinessAccounts = signal<BusinessAccount[]>([]);

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
    this.loadKnownBusinessAccounts();
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

  loadKnownBusinessAccounts(): void {
    this.businessApi
      .listBusinessAccounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.knownBusinessAccounts.set(response.businessAccounts),
        error: () => this.knownBusinessAccounts.set([]),
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
          void this.router.navigate(['/businesses', response.businessAccount.id, 'business-data']);
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

    const businessAccountId = this.requestForm.controls.businessAccountId.value.trim();
    const existingStatus = this.membershipStatusForBusiness(businessAccountId);

    if (existingStatus === 'pending') {
      this.success.set('Ya existe una solicitud pendiente para este negocio.');
      return;
    }

    if (existingStatus === 'approved') {
      this.session.setActiveBusinessAccountId(businessAccountId);
      this.success.set('Ya tienes acceso aprobado. Negocio activo seleccionado.');
      void this.router.navigate(['/businesses', businessAccountId, 'business-data']);
      return;
    }

    this.requestingAccess.set(true);
    this.businessApi
      .requestMembership({
        businessAccountId,
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
            this.success.set('Ya existe acceso aprobado. Negocio activo seleccionado.');
            void this.router.navigate([
              '/businesses',
              response.membership.businessAccountId,
              'business-data',
            ]);
            return;
          }

          if (existingStatus === 'rejected') {
            this.success.set('Solicitud enviada nuevamente. Un owner debe aprobar el acceso.');
            return;
          }

          this.success.set('Solicitud enviada. Un owner debe aprobar el acceso.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  selectBusiness(membership: BusinessMembership): void {
    this.session.setActiveBusinessAccountId(membership.businessAccountId);
    void this.router.navigate(['/businesses', membership.businessAccountId, 'business-data']);
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

  selectKnownBusiness(event: Event): void {
    const businessAccountId = (event.target as HTMLSelectElement).value;
    this.requestForm.patchValue({ businessAccountId });
  }

  private membershipStatusForBusiness(businessAccountId: string): BusinessMembership['status'] | null {
    return (
      this.session
        .memberships()
        .find((membership) => membership.businessAccountId === businessAccountId)?.status ?? null
    );
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
