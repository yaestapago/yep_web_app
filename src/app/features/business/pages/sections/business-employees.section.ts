import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideCalendarClock,
  LucideClipboardCheck,
  LucideClipboardCopy,
  LucideLoaderCircle,
  LucideUserPlus,
} from '@lucide/angular';
import * as QRCode from 'qrcode';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { BusinessMembershipRole } from '../../../../shared/models/auth.models';
import type { BusinessLocation } from '../../../../shared/models/bank-account.models';
import type { ApprovedMember } from '../../../../shared/models/schedule.models';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { Select, type SelectOption } from '../../../../shared/ui/select/select';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

/**
 * Empleados del negocio: lista de miembros aprobados con altas, edición de rol
 * y sedes, y baja (revocación). También comparte el código/QR de registro.
 */
@Component({
  selector: 'app-business-employees-section',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Button,
    Input,
    Modal,
    Select,
    LucideCalendarClock,
    LucideClipboardCheck,
    LucideClipboardCopy,
    LucideLoaderCircle,
    LucideUserPlus,
  ],
  templateUrl: './business-employees.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessEmployeesSection implements OnInit {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notifications = inject(NotificationModalService);

  readonly businessId = this.session.activeBusinessAccountId;
  readonly membership = this.session.activeMembership;
  readonly account = computed(() => this.membership()?.businessAccount ?? null);
  readonly businessName = computed(() => this.account()?.name?.trim() || 'Negocio sin nombre');
  readonly members = signal<ApprovedMember[]>([]);
  readonly locations = signal<BusinessLocation[]>([]);
  readonly loading = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly success = signal('');
  readonly inviteOpen = signal(false);
  readonly copied = signal(false);
  readonly linkCopied = signal(false);
  readonly qrDataUrl = signal('');
  readonly qrError = signal('');

  // Alta directa de un miembro (por correo o cédula).
  readonly addOpen = signal(false);
  readonly savingAdd = signal(false);

  // Edición de rol y sedes de un miembro existente.
  readonly editOpen = signal(false);
  readonly savingEdit = signal(false);
  readonly editingMember = signal<ApprovedMember | null>(null);
  readonly selectedLocationIds = signal<string[]>([]);
  readonly actingId = signal<string | null>(null);

  readonly roleOptions: readonly SelectOption[] = [
    { id: 'account_staff', label: 'Staff' },
    { id: 'account_owner', label: 'Propietario' },
  ];

  readonly canManage = computed(
    () =>
      this.session.activeMembership()?.role === 'account_owner' ||
      this.session.user()?.globalRole === 'account_su',
  );

  readonly addForm = this.fb.group({
    email: ['', [Validators.email]],
    identificationNumber: [''],
    role: ['account_staff' as BusinessMembershipRole, [Validators.required]],
  });

  readonly editForm = this.fb.group({
    role: ['account_staff' as BusinessMembershipRole, [Validators.required]],
  });

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

  readonly registrationPath = computed(() => {
    const code = this.shareCode();
    if (!code) {
      return '';
    }
    const params = new URLSearchParams({
      code,
      businessName: this.businessName(),
    });
    return `/register?${params.toString()}`;
  });

  private qrGeneration = 0;

  constructor() {
    effect(() => {
      const link = this.registrationLink();
      const generation = ++this.qrGeneration;
      this.qrDataUrl.set('');
      this.qrError.set('');

      if (!link) {
        return;
      }

      void QRCode.toDataURL(link, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 220,
        color: {
          dark: '#102a2cff',
          light: '#ffffffff',
        },
      })
        .then((dataUrl) => {
          if (generation === this.qrGeneration) {
            this.qrDataUrl.set(dataUrl);
          }
        })
        .catch(() => {
          if (generation === this.qrGeneration) {
            this.qrError.set('No se pudo generar el QR.');
          }
        });
    });
  }

  ngOnInit(): void {
    this.load();
    this.loadLocations();
  }

  load(): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }
    this.loading.set(true);
    this.message.set('');
    this.businessApi
      .listApprovedMembers(businessId)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.members.set(response.memberships),
        error: (error) => this.handleError(error),
      });
  }

  loadLocations(): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }
    this.businessApi
      .listLocations(businessId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.locations.set(response.locations),
        error: () => this.locations.set([]),
      });
  }

  employeeLabel(member: ApprovedMember): string {
    const name = [member.firstName, member.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return (
      name ||
      member.email ||
      member.identificationNumber ||
      'Empleado sin datos'
    );
  }

  contactLabel(member: ApprovedMember): string {
    return member.cellphoneNumber ?? member.email ?? member.identificationNumber ?? '';
  }

  roleLabel(member: ApprovedMember): string {
    return member.role === 'account_owner' ? 'Propietario' : 'Staff';
  }

  locationNames(member: ApprovedMember): string {
    if (!member.locationIds?.length) {
      return 'Todas las sedes';
    }
    const names = member.locationIds.map(
      (id) => this.locations().find((location) => location.id === id)?.name ?? id,
    );
    return names.join(', ');
  }

  scheduleLink(): unknown[] {
    const id = this.businessId();
    return id ? ['/businesses', id, 'schedules'] : ['/businesses'];
  }

  // --- Alta directa ---------------------------------------------------------

  openAdd(): void {
    this.error.set('');
    this.success.set('');
    this.addForm.reset({ email: '', identificationNumber: '', role: 'account_staff' });
    this.addOpen.set(true);
  }

  async closeAdd(): Promise<void> {
    if (this.savingAdd()) {
      return;
    }
    if (this.addForm.dirty) {
      const confirmed = await this.notifications.confirm({
        title: 'Descartar cambios',
        message: 'Tienes datos sin guardar del nuevo usuario.',
        type: 'warning',
        confirmText: 'Descartar',
      });
      if (!confirmed) {
        return;
      }
    }
    this.addOpen.set(false);
  }

  submitAdd(): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }

    const raw = this.addForm.getRawValue();
    const email = raw.email.trim();
    const identificationNumber = raw.identificationNumber.trim();

    if (this.addForm.invalid || (!email && !identificationNumber)) {
      this.addForm.markAllAsTouched();
      if (!email && !identificationNumber) {
        this.error.set('Ingresa el correo o el número de identificación.');
      }
      return;
    }

    this.savingAdd.set(true);
    this.error.set('');

    this.businessApi
      .addMember(businessId, {
        email: email || undefined,
        identificationNumber: identificationNumber || undefined,
        role: raw.role,
      })
      .pipe(
        finalize(() => this.savingAdd.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.success.set('Usuario agregado o invitado.');
          this.addOpen.set(false);
          // Recargamos porque un usuario ya registrado queda aprobado y debe
          // aparecer en la lista; una invitación pendiente no aparece aún.
          this.load();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  // --- Edición de rol y sedes ----------------------------------------------

  openEdit(member: ApprovedMember): void {
    this.error.set('');
    this.success.set('');
    this.editingMember.set(member);
    this.selectedLocationIds.set([...(member.locationIds ?? [])]);
    this.editForm.reset({ role: member.role });
    this.editOpen.set(true);
  }

  closeEdit(): void {
    if (this.savingEdit()) {
      return;
    }
    this.editOpen.set(false);
    this.editingMember.set(null);
  }

  toggleLocation(locationId: string, checked: boolean): void {
    this.selectedLocationIds.update((ids) =>
      checked ? Array.from(new Set([...ids, locationId])) : ids.filter((id) => id !== locationId),
    );
  }

  submitEdit(): void {
    const businessId = this.businessId();
    const member = this.editingMember();
    if (!businessId || !member || this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    this.savingEdit.set(true);
    this.error.set('');

    this.businessApi
      .updateMember(businessId, member.id, {
        role: this.editForm.getRawValue().role,
        locationIds: this.selectedLocationIds(),
      })
      .pipe(
        finalize(() => this.savingEdit.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.members.update((members) =>
            members.map((current) =>
              current.id === response.membership.id
                ? { ...current, ...response.membership }
                : current,
            ),
          );
          this.success.set('Empleado actualizado.');
          this.closeEdit();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  // --- Baja (revocación) ----------------------------------------------------

  async remove(member: ApprovedMember): Promise<void> {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }

    const confirmed = await this.notifications.confirm({
      title: 'Quitar empleado',
      message: `${this.employeeLabel(member)} perderá el acceso a este negocio.`,
      type: 'warning',
      confirmText: 'Quitar',
    });
    if (!confirmed) {
      return;
    }

    this.actingId.set(member.id);
    this.error.set('');
    this.success.set('');

    this.businessApi
      .updateMembershipStatus(businessId, member.id, { status: 'revoked' })
      .pipe(
        finalize(() => this.actingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.members.update((members) => members.filter((current) => current.id !== member.id));
          this.success.set('Empleado removido.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  isAddInvalid(controlName: keyof typeof this.addForm.controls): boolean {
    const control = this.addForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  // --- Compartir código / QR ------------------------------------------------

  openInvite(): void {
    this.inviteOpen.set(true);
  }

  closeInvite(): void {
    this.inviteOpen.set(false);
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

  private handleError(error: unknown): void {
    this.members.set([]);
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.message.set('No tienes permisos para ver los empleados.');
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.message.set('El listado de empleados aún no está disponible en el backend.');
      return;
    }
    this.message.set(httpErrorMessage(error));
  }
}
