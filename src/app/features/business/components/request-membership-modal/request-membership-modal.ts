import { Component, DestroyRef, inject, input as defineInput, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type {
  BusinessMembership,
  BusinessMembershipRole,
} from '../../../../shared/models/auth.models';
import type { BusinessLookupResult } from '../../../../shared/models/business-account.models';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { Select, type SelectOption } from '../../../../shared/ui/select/select';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

/**
 * Modal para solicitar acceso a un negocio existente como staff o propietario.
 * En vez del ID completo, el usuario ingresa un código corto (los últimos
 * caracteres del ID, que el owner comparte) y elige el negocio resuelto.
 * Un owner del negocio debe aprobar la solicitud después.
 */
@Component({
  selector: 'app-request-membership-modal',
  imports: [ReactiveFormsModule, Button, Input, Modal, Select],
  templateUrl: './request-membership-modal.html',
  styleUrl: './request-membership-modal.scss',
})
export class RequestMembershipModal {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notificationModal = inject(NotificationModalService);

  readonly open = defineInput(false);
  readonly closeRequested = output<void>();
  readonly requested = output<void>();

  readonly searching = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  /** Resultados del lookup por código. Si hay >1, el usuario elige. */
  readonly matches = signal<BusinessLookupResult[]>([]);
  readonly selected = signal<BusinessLookupResult | null>(null);

  readonly roleOptions: SelectOption[] = [
    { id: 'account_staff', label: 'Staff (empleado)' },
    { id: 'account_owner', label: 'Propietario' },
  ];

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(6)]],
    role: this.fb.control<BusinessMembershipRole>('account_staff', [Validators.required]),
  });

  constructor() {
    // Si el usuario cambia el código tras resolver un negocio, invalida la
    // selección previa para que no envíe una solicitud al negocio equivocado.
    this.form.controls.code.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.selected.set(null);
      this.matches.set([]);
      this.error.set('');
    });
  }

  reset(): void {
    this.error.set('');
    this.success.set('');
    this.matches.set([]);
    this.selected.set(null);
    this.form.reset({ code: '', role: 'account_staff' });
  }

  async close(): Promise<void> {
    if (this.saving() || this.searching()) {
      return;
    }

    if (this.form.dirty) {
      const confirmed = await this.notificationModal.confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar en la solicitud.',
        type: 'warning',
        confirmText: 'Descartar',
      });

      if (!confirmed) {
        return;
      }
    }

    this.closeRequested.emit();
  }

  matchOptions(): SelectOption[] {
    return this.matches().map((business) => ({
      id: business.id,
      label: business.city ? `${business.name} — ${business.city}` : business.name,
    }));
  }

  selectedLabel(): string {
    const business = this.selected();
    if (!business) {
      return '';
    }
    return business.city ? `${business.name} — ${business.city}` : business.name;
  }

  search(): void {
    this.error.set('');
    this.success.set('');
    this.selected.set(null);
    this.matches.set([]);

    const code = this.form.controls.code.value.trim();
    if (code.length < 6) {
      this.form.controls.code.markAsTouched();
      return;
    }

    this.searching.set(true);
    this.businessApi
      .lookupBusinessByCode(code)
      .pipe(
        finalize(() => this.searching.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          const results = response.businessAccounts;
          if (results.length === 0) {
            this.error.set('No se encontró ningún negocio con ese código.');
            return;
          }
          if (results.length === 1) {
            this.selected.set(results[0]);
            return;
          }
          this.matches.set(results);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  pickMatch(businessAccountId: string): void {
    this.selected.set(this.matches().find((b) => b.id === businessAccountId) ?? null);
  }

  submit(): void {
    this.error.set('');
    this.success.set('');

    const business = this.selected();
    if (!business) {
      this.error.set('Primero busca y selecciona el negocio con su código.');
      return;
    }

    const role = this.form.controls.role.value;
    const existingStatus = this.membershipStatusForBusiness(business.id);

    if (existingStatus === 'pending') {
      this.success.set('Ya existe una solicitud pendiente para este negocio.');
      return;
    }

    if (existingStatus === 'approved') {
      this.success.set('Ya tienes acceso aprobado a este negocio.');
      return;
    }

    this.saving.set(true);
    this.businessApi
      .requestMembership({ businessAccountId: business.id, role })
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.session.updateMemberships(this.mergeMembership(response.membership));
          this.requested.emit();

          if (response.membership.status === 'approved') {
            this.success.set('Ya tienes acceso aprobado a este negocio.');
            return;
          }

          this.success.set('Solicitud enviada. Un owner del negocio debe aprobar el acceso.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  private membershipStatusForBusiness(
    businessAccountId: string,
  ): BusinessMembership['status'] | null {
    return (
      this.session
        .memberships()
        .find((membership) => membership.businessAccountId === businessAccountId)?.status ?? null
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
