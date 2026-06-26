import { Component, DestroyRef, inject, input as defineInput, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { PhoneInput, type PhoneInputValue } from '../../../../shared/ui/phone-input/phone-input';
import type { BusinessMembership } from '../../../../shared/models/auth.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

/**
 * Modal reutilizable para crear un negocio sin abandonar el layout.
 * Tras crearlo, lo fija como activo y emite su id para que el padre navegue
 * a la vista del negocio.
 */
@Component({
  selector: 'app-create-business-modal',
  imports: [ReactiveFormsModule, Button, Input, Modal, PhoneInput],
  templateUrl: './create-business-modal.html',
})
export class CreateBusinessModal {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly open = defineInput(false);
  readonly closeRequested = output<void>();
  readonly created = output<string>();

  readonly saving = signal(false);
  readonly error = signal('');

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    city: ['', [Validators.required, Validators.minLength(2)]],
    address: ['', [Validators.required, Validators.minLength(4)]],
    phone: this.fb.control<PhoneInputValue | string | null>(null, [Validators.required]),
  });

  reset(): void {
    this.error.set('');
    this.form.reset({ name: '', city: '', address: '', phone: '' });
  }

  close(): void {
    if (this.saving()) {
      return;
    }
    this.closeRequested.emit();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const raw = this.form.getRawValue();

    this.businessApi
      .createBusinessAccount({
        name: raw.name,
        city: raw.city,
        address: raw.address,
        phone: this.phoneValue(raw.phone),
      })
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          const membership: BusinessMembership = {
            ...response.membership,
            businessAccount: response.membership.businessAccount ?? response.businessAccount,
          };
          this.session.updateMemberships(this.mergeMembership(membership));
          this.session.setActiveBusinessAccountId(response.businessAccount.id);
          this.created.emit(response.businessAccount.id);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  private mergeMembership(membership: BusinessMembership): BusinessMembership[] {
    const memberships = this.session.memberships();
    const index = memberships.findIndex((current) => current.id === membership.id);

    if (index === -1) {
      return [membership, ...memberships];
    }

    return memberships.map((current, i) => (i === index ? membership : current));
  }

  private phoneValue(value: PhoneInputValue | string | null): string {
    if (!value) {
      return '';
    }
    return typeof value === 'string' ? value : value.e164;
  }
}
