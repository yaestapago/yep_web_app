import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideLoaderCircle,
  LucidePencil,
  LucidePlus,
  LucideTrash2,
} from '@lucide/angular';
import { finalize } from 'rxjs';

import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { StatusDot } from '../../../../shared/ui/status-dot/status-dot';
import { Toggle } from '../../../../shared/ui/toggle/toggle';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import type {
  AdminBank,
  CreateBankRequest,
  UpdateBankRequest,
} from '../../../../shared/models/bank.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AdminBanksApiService } from '../../services/admin-banks-api.service';

/** Descripción en lenguaje natural de un canal, para el panel de claridad. */
interface ChannelClarity {
  channel: string;
  text: string;
}

/**
 * Vista de superadmin (path secreto): CRUD del catálogo global de bancos, que es
 * la fuente de verdad de qué escucha/evita cada notificador de la flota. Editar
 * aquí se propaga a los dispositivos en su próximo heartbeat (vía rulesVersion),
 * sin re-emparejar.
 */
@Component({
  selector: 'app-bank-admin-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Alert,
    Button,
    Input,
    Modal,
    StatusDot,
    Toggle,
    LucideArrowLeft,
    LucideLoaderCircle,
    LucidePencil,
    LucidePlus,
    LucideTrash2,
  ],
  templateUrl: './bank-admin.page.html',
  styleUrl: './bank-admin.page.scss',
})
export class BankAdminPage {
  private readonly api = inject(AdminBanksApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notifications = inject(NotificationModalService);
  private readonly destroyRef = inject(DestroyRef);

  readonly banks = signal<AdminBank[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly actingCode = signal<string | null>(null);
  readonly editingCode = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly modalOpen = signal(false);

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^[a-z0-9][a-z0-9_-]*$/)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    isActive: [true],
    phoneEnabled: [false],
    phonePackageNames: [''],
    phoneContentPatterns: [''],
    phoneDisplayNames: [''],
    emailEnabled: [false],
    emailPackageNames: [''],
    emailContentPatterns: [''],
    emailDisplayNames: [''],
  });

  /** Valor del form como signal, para conducir el panel de claridad zoneless. */
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** Traduce el estado actual del form a lenguaje natural, por canal. */
  readonly clarity = computed<ChannelClarity[]>(() => {
    const v = this.formValue();
    return [
      {
        channel: 'Teléfono',
        text: this.describeChannel(
          'Teléfono',
          Boolean(v.phoneEnabled),
          v.phonePackageNames ?? '',
          v.phoneContentPatterns ?? '',
          v.phoneDisplayNames ?? '',
        ),
      },
      {
        channel: 'Correo',
        text: this.describeChannel(
          'Correo',
          Boolean(v.emailEnabled),
          v.emailPackageNames ?? '',
          v.emailContentPatterns ?? '',
          v.emailDisplayNames ?? '',
        ),
      },
    ];
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .list()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.banks.set(response.banks),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  openCreate(): void {
    this.error.set('');
    this.success.set('');
    this.editingCode.set(null);
    this.form.reset({
      code: '',
      name: '',
      isActive: true,
      phoneEnabled: false,
      phonePackageNames: '',
      phoneContentPatterns: '',
      phoneDisplayNames: '',
      emailEnabled: false,
      emailPackageNames: '',
      emailContentPatterns: '',
      emailDisplayNames: '',
    });
    this.form.controls.code.enable();
    this.modalOpen.set(true);
  }

  openEdit(bank: AdminBank): void {
    this.error.set('');
    this.success.set('');
    this.editingCode.set(bank.code);
    this.form.reset({
      code: bank.code,
      name: bank.name,
      isActive: bank.isActive,
      phoneEnabled: bank.phone.enabled,
      phonePackageNames: bank.phone.packageNames.join('\n'),
      phoneContentPatterns: bank.phone.contentPatterns.join('\n'),
      phoneDisplayNames: bank.phone.displayNames.join('\n'),
      emailEnabled: bank.email.enabled,
      emailPackageNames: bank.email.packageNames.join('\n'),
      emailContentPatterns: bank.email.contentPatterns.join('\n'),
      emailDisplayNames: bank.email.displayNames.join('\n'),
    });
    // `code` es inmutable: la clave de referencia de las cuentas bancarias.
    this.form.controls.code.disable();
    this.modalOpen.set(true);
  }

  /** Fija un toggle no-CVA en el reactive form y marca el form como sucio. */
  setToggle(
    control:
      | 'isActive'
      | 'phoneEnabled'
      | 'emailEnabled',
    value: boolean,
  ): void {
    this.form.controls[control].setValue(value);
    this.form.controls[control].markAsDirty();
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const editingCode = this.editingCode();
    this.saving.set(true);
    this.error.set('');

    const phone = {
      enabled: v.phoneEnabled,
      packageNames: this.toList(v.phonePackageNames),
      contentPatterns: this.toList(v.phoneContentPatterns),
      displayNames: this.toList(v.phoneDisplayNames),
    };
    const email = {
      enabled: v.emailEnabled,
      packageNames: this.toList(v.emailPackageNames),
      contentPatterns: this.toList(v.emailContentPatterns),
      displayNames: this.toList(v.emailDisplayNames),
    };

    const request$ = editingCode
      ? this.api.update(editingCode, {
          name: v.name.trim(),
          isActive: v.isActive,
          phone,
          email,
        } satisfies UpdateBankRequest)
      : this.api.create({
          code: v.code.trim().toLowerCase(),
          name: v.name.trim(),
          isActive: v.isActive,
          phone,
          email,
        } satisfies CreateBankRequest);

    request$
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          const bank = response.bank;
          this.banks.update((banks) =>
            editingCode
              ? banks.map((b) => (b.code === bank.code ? bank : b))
              : [bank, ...banks],
          );
          this.success.set(
            editingCode
              ? 'Cambios guardados. Los dispositivos se actualizarán en el próximo latido.'
              : 'Banco creado.',
          );
          this.modalOpen.set(false);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  async remove(bank: AdminBank): Promise<void> {
    const confirmed = await this.notifications.confirm({
      title: 'Desactivar banco',
      message: `"${bank.name}" dejará de escucharse en toda la flota. Podrás reactivarlo editándolo.`,
      type: 'warning',
      confirmText: 'Desactivar',
    });
    if (!confirmed) return;

    this.actingCode.set(bank.code);
    this.error.set('');
    this.success.set('');
    this.api
      .remove(bank.code)
      .pipe(
        finalize(() => this.actingCode.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.banks.update((banks) =>
            banks.map((b) => (b.code === response.bank.code ? response.bank : b)),
          );
          this.success.set('Banco desactivado.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  async closeModal(): Promise<void> {
    if (this.saving()) return;
    if (this.form.dirty) {
      const confirmed = await this.notifications.confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar en este banco.',
        type: 'warning',
        confirmText: 'Descartar',
      });
      if (!confirmed) return;
    }
    this.modalOpen.set(false);
  }

  isInvalid(controlName: 'code' | 'name'): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  channelBadges(bank: AdminBank): string[] {
    const badges: string[] = [];
    if (bank.phone.enabled) badges.push('Teléfono');
    if (bank.email.enabled) badges.push('Correo');
    return badges;
  }

  /** Divide un textarea (por línea o coma) en lista normalizada, igual que el backend. */
  private toList(raw: string): string[] {
    return Array.from(
      new Set(
        (raw ?? '')
          .split(/[\n,]/)
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
  }

  private describeChannel(
    name: string,
    enabled: boolean,
    pkgRaw: string,
    patRaw: string,
    dispRaw: string,
  ): string {
    if (!enabled) return `${name}: desactivado — no se escucha nada por este canal.`;
    const pkgs = this.toList(pkgRaw);
    if (pkgs.length === 0) {
      return `${name}: habilitado pero sin apps configuradas — no se escuchará nada hasta agregar paquetes.`;
    }
    const pats = this.toList(patRaw);
    let text = pats.length
      ? `${name}: escuchará ${pkgs.join(', ')} y enviará solo los mensajes que contengan alguno de: ${pats.join(', ')}; el resto se ignora.`
      : `${name}: enviará todas las notificaciones de ${pkgs.join(', ')}; sin filtro por contenido.`;
    const disps = this.toList(dispRaw);
    if (disps.length) {
      text += ` En escritorio (Vínculo con Windows) también se identifica por: ${disps.join(', ')}.`;
    }
    return text;
  }
}
