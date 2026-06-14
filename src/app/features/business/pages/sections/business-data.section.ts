import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucidePencil } from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

/**
 * Datos del negocio: información general editable. Antes vivía junto a las sedes
 * en `BusinessSettingsSection`; ahora es una vista independiente accesible desde
 * el sidebar (grupo "Negocio").
 */
@Component({
  selector: 'app-business-data-section',
  imports: [ReactiveFormsModule, Button, Input, Modal, LucidePencil],
  templateUrl: './business-data.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessDataSection {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly businessId = this.session.activeBusinessAccountId;
  readonly membership = this.session.activeMembership;
  readonly account = computed(() => this.membership()?.businessAccount ?? null);
  readonly businessName = computed(() => this.account()?.name?.trim() || 'Negocio sin nombre');
  readonly canManage = computed(
    () =>
      this.membership()?.role === 'account_owner' ||
      this.session.user()?.globalRole === 'account_su',
  );

  readonly savingBusiness = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly editOpen = signal(false);

  readonly businessForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    city: ['', [Validators.required, Validators.minLength(2)]],
    address: ['', [Validators.required, Validators.minLength(4)]],
    phone: ['', [Validators.required, Validators.minLength(7)]],
  });

  openEdit(): void {
    const account = this.account();
    this.error.set('');
    this.success.set('');
    this.businessForm.reset({
      name: account?.name ?? '',
      city: account?.city ?? '',
      address: account?.address ?? '',
      phone: account?.phone ?? '',
    });
    this.editOpen.set(true);
  }

  closeEdit(): void {
    if (this.savingBusiness()) {
      return;
    }
    this.editOpen.set(false);
  }

  saveBusiness(): void {
    const businessId = this.businessId();
    if (!businessId || this.businessForm.invalid) {
      this.businessForm.markAllAsTouched();
      return;
    }

    this.savingBusiness.set(true);
    this.error.set('');

    this.businessApi
      .updateBusinessAccount(businessId, this.businessForm.getRawValue())
      .pipe(
        finalize(() => this.savingBusiness.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.session.patchBusinessAccount(response.businessAccount);
          this.success.set('Datos del negocio actualizados.');
          this.editOpen.set(false);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  isBusinessInvalid(controlName: keyof typeof this.businessForm.controls): boolean {
    const control = this.businessForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }
}
