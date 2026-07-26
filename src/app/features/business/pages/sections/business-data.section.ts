import { Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideClipboardCheck,
  LucideClipboardCopy,
  LucidePencil,
  LucideTrash2,
  LucideTriangleAlert,
} from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { AddressLocationValue } from '../../../../shared/models/geo.models';
import { AddressLocationSelect } from '../../../../shared/ui/address-location-select/address-location-select';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { OtpInput } from '../../../../shared/ui/otp-input/otp-input';
import { PhoneInput, type PhoneInputValue } from '../../../../shared/ui/phone-input/phone-input';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AdminBusinessesApiService } from '../../services/admin-businesses-api.service';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

type DeleteBusinessStep = 'password' | 'code';
type OtpStatus = 'idle' | 'sending' | 'validating' | 'success' | 'error';

/**
 * Datos del negocio: información general editable. Antes vivía junto a las sedes
 * en `BusinessSettingsSection`; ahora es una vista independiente accesible desde
 * el sidebar (grupo "Negocio").
 */
@Component({
  selector: 'app-business-data-section',
  imports: [
    ReactiveFormsModule,
    AddressLocationSelect,
    Alert,
    Button,
    Input,
    Modal,
    OtpInput,
    PhoneInput,
    LucidePencil,
    LucideClipboardCopy,
    LucideClipboardCheck,
    LucideTrash2,
    LucideTriangleAlert,
  ],
  templateUrl: './business-data.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessDataSection implements OnDestroy {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly adminBusinessesApi = inject(AdminBusinessesApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notificationModal = inject(NotificationModalService);
  private readonly router = inject(Router);

  readonly businessId = this.session.activeBusinessAccountId;
  readonly membership = this.session.activeMembership;
  readonly account = computed(() => this.membership()?.businessAccount ?? null);
  readonly businessName = computed(() => this.account()?.name?.trim() || 'Negocio sin nombre');
  readonly canManage = computed(
    () =>
      this.membership()?.role === 'account_owner' ||
      this.session.user()?.globalRole === 'account_su',
  );
  readonly isSuperUser = computed(() => this.session.user()?.globalRole === 'account_su');

  readonly savingBusiness = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly editOpen = signal(false);
  readonly copied = signal(false);
  readonly linkCopied = signal(false);

  /**
   * Código corto para compartir: los últimos 6 caracteres del ID del negocio.
   * El staff lo usa en "Unirme a un negocio" para solicitar acceso sin pegar
   * el ID completo.
   */
  readonly shareCode = computed(() => {
    const id = this.businessId();
    return id ? id.slice(-6).toUpperCase() : '';
  });

  readonly registrationLink = computed(() => {
    const code = this.shareCode();
    if (!code) {
      return '';
    }
    const origin = globalThis.location?.origin ?? '';
    const params = new URLSearchParams({
      code,
      businessName: this.businessName(),
    });
    return `${origin}/register?${params.toString()}`;
  });

  ngOnDestroy(): void {
    this.clearDeleteResendTimer();
  }

  copyCode(): void {
    const code = this.shareCode();
    if (!code) {
      return;
    }
    void navigator.clipboard?.writeText(code).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }

  copyRegistrationLink(): void {
    const link = this.registrationLink();
    if (!link) {
      return;
    }
    void navigator.clipboard?.writeText(link).then(() => {
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 1500);
    });
  }

  readonly businessForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    location: this.fb.control<AddressLocationValue | null>(null, [Validators.required]),
    address: ['', [Validators.required, Validators.minLength(4)]],
    phone: this.fb.control<PhoneInputValue | string | null>(null, [Validators.required]),
  });

  openEdit(): void {
    const account = this.account();
    this.error.set('');
    this.success.set('');
    this.businessForm.reset({
      name: account?.name ?? '',
      location: this.accountLocationValue(),
      address: account?.address ?? '',
      phone: account?.phone ?? '',
    });
    this.editOpen.set(true);
  }

  async closeEdit(): Promise<void> {
    if (this.savingBusiness()) {
      return;
    }

    if (this.businessForm.dirty) {
      const confirmed = await this.notificationModal.confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar en los datos del negocio.',
        type: 'warning',
        confirmText: 'Descartar',
      });

      if (!confirmed) {
        return;
      }
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
    const raw = this.businessForm.getRawValue();

    this.businessApi
      .updateBusinessAccount(businessId, {
        name: raw.name,
        departmentCode: raw.location?.departmentCode,
        departmentName: raw.location?.departmentName,
        cityCode: raw.location?.cityCode,
        cityName: raw.location?.cityName,
        address: raw.address,
        phone: this.phoneValue(raw.phone),
      })
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

  private phoneValue(value: PhoneInputValue | string | null): string {
    if (!value) {
      return '';
    }
    return typeof value === 'string' ? value : value.e164;
  }

  private accountLocationValue(): AddressLocationValue | null {
    const account = this.account();
    if (!account) {
      return null;
    }

    return {
      departmentCode: account.departmentCode,
      departmentName: account.departmentName,
      cityCode: account.cityCode,
      cityName: account.cityName,
    };
  }

  // --- Eliminar negocio (superadmin): contraseña + código emailado --------

  readonly deleteModalOpen = signal(false);
  readonly deleteStep = signal<DeleteBusinessStep>('password');
  readonly deleting = signal(false);
  readonly deleteError = signal('');
  readonly deleteOtpStatus = signal<OtpStatus>('idle');
  readonly deleteOtpError = signal('');
  readonly deleteResendSeconds = signal(0);

  readonly deletePasswordForm = this.fb.group({
    password: ['', Validators.required],
  });

  private deleteResendInterval: ReturnType<typeof setInterval> | null = null;

  async confirmDeleteIntent(): Promise<void> {
    const confirmed = await this.notificationModal.confirm({
      title: 'Eliminar negocio',
      message: [
        `Esta acción eliminará PERMANENTEMENTE "${this.businessName()}" y todos sus datos (transacciones, notificadores, empleados, sedes, cuentas bancarias, etc.).`,
        'No se puede deshacer.',
      ],
      type: 'warning',
      confirmText: 'Continuar',
    });

    if (confirmed) {
      this.openDeleteModal();
    }
  }

  openDeleteModal(): void {
    this.deletePasswordForm.reset({ password: '' });
    this.deleteStep.set('password');
    this.deleteError.set('');
    this.deleteOtpStatus.set('idle');
    this.deleteOtpError.set('');
    this.clearDeleteResendTimer();
    this.deleteModalOpen.set(true);
  }

  closeDeleteModal(): void {
    if (this.deleting()) {
      return;
    }
    this.clearDeleteResendTimer();
    this.deleteModalOpen.set(false);
  }

  submitDeletePassword(): void {
    const businessId = this.businessId();
    if (!businessId || this.deletePasswordForm.invalid) {
      this.deletePasswordForm.markAllAsTouched();
      return;
    }

    this.deleting.set(true);
    this.deleteError.set('');
    const { password } = this.deletePasswordForm.getRawValue();

    this.adminBusinessesApi
      .requestDeletion(businessId, password)
      .pipe(
        finalize(() => this.deleting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.deleteStep.set('code');
          this.deleteOtpStatus.set('idle');
          this.deleteOtpError.set('');
          this.startDeleteResendTimer(response.resendInSeconds ?? 60);
        },
        error: (error) => this.deleteError.set(httpErrorMessage(error)),
      });
  }

  resendDeletionCode(): void {
    if (this.deleteResendSeconds() > 0 || this.deleting()) {
      return;
    }
    this.submitDeletePassword();
  }

  confirmDeleteCode(code: string): void {
    const businessId = this.businessId();
    if (!businessId || this.deleteOtpStatus() === 'validating' || this.deleteOtpStatus() === 'success') {
      return;
    }

    this.deleteOtpError.set('');
    this.deleteOtpStatus.set('validating');
    this.deleting.set(true);

    this.adminBusinessesApi
      .confirmDeletion(businessId, code)
      .pipe(
        finalize(() => this.deleting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.deleteOtpStatus.set('success');
          this.clearDeleteResendTimer();
          this.session.removeMembership(businessId);
          this.deleteModalOpen.set(false);
          void this.router.navigate(['/businesses']);
        },
        error: (error) => {
          this.deleteOtpStatus.set('error');
          this.deleteOtpError.set(httpErrorMessage(error));
        },
      });
  }

  handleDeleteCodeChanged(value: string): void {
    if (value.length < 6 && (this.deleteOtpStatus() === 'error' || this.deleteOtpStatus() === 'success')) {
      this.deleteOtpStatus.set('idle');
      this.deleteOtpError.set('');
    }
  }

  private startDeleteResendTimer(seconds: number): void {
    this.clearDeleteResendTimer();
    this.deleteResendSeconds.set(Math.max(0, seconds));

    this.deleteResendInterval = setInterval(() => {
      const nextSeconds = Math.max(0, this.deleteResendSeconds() - 1);
      this.deleteResendSeconds.set(nextSeconds);
      if (nextSeconds === 0) this.clearDeleteResendTimer();
    }, 1000);
  }

  private clearDeleteResendTimer(): void {
    if (!this.deleteResendInterval) return;
    clearInterval(this.deleteResendInterval);
    this.deleteResendInterval = null;
  }
}
