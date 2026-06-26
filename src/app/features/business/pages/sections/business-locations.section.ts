import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideLoaderCircle, LucideMapPin, LucidePlus } from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
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
  readonly error = signal('');
  readonly success = signal('');
  readonly locationOpen = signal(false);

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
    this.locationForm.reset({ name: '', city: '', address: '', phone: '' });
    this.locationOpen.set(true);
  }

  closeLocation(): void {
    if (this.savingLocation()) {
      return;
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
    this.savingLocation.set(true);
    this.error.set('');

    this.businessApi
      .createLocation(businessId, {
        name: raw.name.trim(),
        city: this.optional(raw.city),
        address: this.optional(raw.address),
        phone: this.optionalPhone(raw.phone),
      })
      .pipe(
        finalize(() => this.savingLocation.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.locations.update((locations) => [response.location, ...locations]);
          this.success.set('Sede creada.');
          this.locationOpen.set(false);
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
