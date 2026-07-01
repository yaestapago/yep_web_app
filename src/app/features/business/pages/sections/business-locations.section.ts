import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideLoaderCircle, LucideMapPin, LucidePlus } from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { Button } from '../../../../shared/ui/button/button';
import { IconButton } from '../../../../shared/ui/icon-button/icon-button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { PhoneInput, type PhoneInputValue } from '../../../../shared/ui/phone-input/phone-input';
import type { BusinessLocation } from '../../../../shared/models/bank-account.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

/**
 * Sedes del negocio: listado y creación. Antes compartía componente con los
 * datos del negocio (`BusinessSettingsSection`); ahora es una vista
 * independiente accesible desde el sidebar (grupo "Negocio").
 */
@Component({
  selector: 'app-business-locations-section',
  imports: [
    ReactiveFormsModule,
    Button,
    IconButton,
    Input,
    Modal,
    PhoneInput,
    LucideLoaderCircle,
    LucideMapPin,
    LucidePlus,
  ],
  templateUrl: './business-locations.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessLocationsSection implements OnInit {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notificationModal = inject(NotificationModalService);

  readonly businessId = this.session.activeBusinessAccountId;
  readonly membership = this.session.activeMembership;
  readonly canManage = computed(
    () =>
      this.membership()?.role === 'account_owner' ||
      this.session.user()?.globalRole === 'account_su',
  );

  readonly locations = signal<BusinessLocation[]>([]);
  readonly loadingLocations = signal(false);
  readonly savingLocation = signal(false);
  readonly actingId = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly locationOpen = signal(false);

  readonly modalTitle = computed(() =>
    this.editingId() ? 'Editar sede' : 'Nueva sede',
  );

  readonly locationForm = this.fb.group({
    name: ['', [Validators.required]],
    city: [''],
    address: [''],
    phone: this.fb.control<PhoneInputValue | string | null>(null),
  });

  ngOnInit(): void {
    this.loadLocations();
  }

  loadLocations(): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }

    this.loadingLocations.set(true);
    this.businessApi
      .listLocations(businessId)
      .pipe(
        finalize(() => this.loadingLocations.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.locations.set(response.locations),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  openLocation(): void {
    this.error.set('');
    this.success.set('');
    this.editingId.set(null);
    this.locationForm.reset({ name: '', city: '', address: '', phone: '' });
    this.locationOpen.set(true);
  }

  openEdit(location: BusinessLocation): void {
    this.error.set('');
    this.success.set('');
    this.editingId.set(location.id);
    this.locationForm.reset({
      name: location.name,
      city: location.city ?? '',
      address: location.address ?? '',
      phone: location.phone ?? '',
    });
    this.locationOpen.set(true);
  }

  async closeLocation(): Promise<void> {
    if (this.savingLocation()) {
      return;
    }

    if (this.locationForm.dirty) {
      const confirmed = await this.notificationModal.confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar en la sede.',
        type: 'warning',
        confirmText: 'Descartar',
      });

      if (!confirmed) {
        return;
      }
    }

    this.locationOpen.set(false);
  }

  saveLocation(): void {
    const businessId = this.businessId();
    if (!businessId || this.locationForm.invalid) {
      this.locationForm.markAllAsTouched();
      return;
    }

    const raw = this.locationForm.getRawValue();
    const payload = {
      name: raw.name.trim(),
      city: this.optional(raw.city),
      address: this.optional(raw.address),
      phone: this.optionalPhone(raw.phone),
    };
    this.savingLocation.set(true);
    this.error.set('');

    const editingId = this.editingId();
    const request = editingId
      ? this.businessApi.updateLocation(businessId, editingId, payload)
      : this.businessApi.createLocation(businessId, payload);

    request
      .pipe(
        finalize(() => this.savingLocation.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          if (editingId) {
            this.locations.update((locations) =>
              locations.map((current) =>
                current.id === response.location.id ? response.location : current,
              ),
            );
            this.success.set('Sede actualizada.');
          } else {
            this.locations.update((locations) => [response.location, ...locations]);
            this.success.set('Sede creada.');
          }
          this.locationOpen.set(false);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  activate(location: BusinessLocation): void {
    this.updateStatus(location, true);
  }

  async deactivate(location: BusinessLocation): Promise<void> {
    const confirmed = await this.notificationModal.confirm({
      title: 'Desactivar sede',
      message:
        'La sede dejará de estar disponible para asociar cuentas y notificadores.',
      type: 'warning',
      confirmText: 'Desactivar',
    });
    if (!confirmed) {
      return;
    }
    this.updateStatus(location, false);
  }

  private updateStatus(location: BusinessLocation, isActive: boolean): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }

    this.actingId.set(location.id);
    this.error.set('');
    this.success.set('');

    const request = isActive
      ? this.businessApi.updateLocation(businessId, location.id, { isActive: true })
      : this.businessApi.deleteLocation(businessId, location.id);

    request
      .pipe(
        finalize(() => this.actingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.locations.update((locations) =>
            locations.map((current) =>
              current.id === response.location.id ? response.location : current,
            ),
          );
          this.success.set(isActive ? 'Sede activada.' : 'Sede desactivada.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  isLocationInvalid(controlName: keyof typeof this.locationForm.controls): boolean {
    const control = this.locationForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  private optional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private optionalPhone(value: PhoneInputValue | string | null): string | undefined {
    if (!value) {
      return undefined;
    }
    return this.optional(typeof value === 'string' ? value : value.e164);
  }
}
