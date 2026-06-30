import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideBell,
  LucideChevronDown,
  LucideMoon,
  LucidePalette,
  LucidePencil,
  LucideShield,
  // LucideSlidersHorizontal se usa solo en el bloque de "Preferencias generales",
  // hoy comentado en el template. Reactívalo junto con ese bloque.
  LucideSun,
  LucideUser,
} from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { ThemeService } from '../../../../core/services/theme.service';
import type {
  GeneralPreferences,
  NotificationPreferences,
} from '../../../../shared/models/auth.models';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { PhoneInput, type PhoneInputValue } from '../../../../shared/ui/phone-input/phone-input';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AuthApiService } from '../../../auth/services/auth-api.service';

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  emailEnabled: true,
  whatsappEnabled: true,
  pushEnabled: false,
  transactionAlerts: true,
  securityAlerts: true,
  marketing: false,
};

const DEFAULT_GENERAL: GeneralPreferences = {
  language: 'es',
  currency: 'COP',
  dateFormat: 'DD/MM/YYYY',
};

interface NotificationToggle {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}

@Component({
  selector: 'app-settings-page',
  imports: [
    ReactiveFormsModule,
    Button,
    Input,
    Modal,
    PhoneInput,
    LucideBell,
    LucideChevronDown,
    LucideMoon,
    LucidePalette,
    LucidePencil,
    LucideShield,
    LucideSun,
    LucideUser,
  ],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage implements OnInit {
  private readonly session = inject(AuthSessionService);
  private readonly theme = inject(ThemeService);
  private readonly authApi = inject(AuthApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notificationModal = inject(NotificationModalService);

  readonly user = this.session.user;
  readonly isDark = this.theme.isDark;

  readonly notifications = computed<NotificationPreferences>(
    () => this.user()?.preferences?.notifications ?? DEFAULT_NOTIFICATIONS,
  );
  readonly general = computed<GeneralPreferences>(
    () => this.user()?.preferences?.general ?? DEFAULT_GENERAL,
  );

  readonly notificationToggles: NotificationToggle[] = [
    {
      key: 'emailEnabled',
      label: 'Correo electrónico',
      description: 'Recibe avisos por email.',
    },
    {
      key: 'whatsappEnabled',
      label: 'WhatsApp',
      description: 'Recibe avisos por WhatsApp.',
    },
    {
      key: 'pushEnabled',
      label: 'Notificaciones push',
      description: 'Alertas en el navegador o la app.',
    },
    // Opciones visuales ocultas temporalmente (sin eliminar del modelo ni del
    // backend). Para volver a mostrarlas, descomenta estas entradas:
    // {
    //   key: 'transactionAlerts',
    //   label: 'Alertas de transacciones',
    //   description: 'Avisos sobre pagos y movimientos.',
    // },
    // {
    //   key: 'securityAlerts',
    //   label: 'Alertas de seguridad',
    //   description: 'Accesos y cambios sensibles en tu cuenta.',
    // },
    {
      key: 'marketing',
      label: 'Novedades y promociones',
      description: 'Mensajes ocasionales sobre el producto.',
    },
  ];

  /** Acordeón de preferencias de notificaciones; inicia cerrado. */
  readonly notificationsOpen = signal(false);

  toggleNotifications(): void {
    this.notificationsOpen.update((open) => !open);
  }

  readonly profileOpen = signal(false);
  readonly passwordOpen = signal(false);
  readonly savingProfile = signal(false);
  readonly savingPassword = signal(false);
  readonly savingNotifications = signal(false);
  readonly savingGeneral = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  readonly profileForm = this.fb.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    cellphoneNumber: this.fb.control<PhoneInputValue | string | null>(null, [Validators.required]),
  });

  readonly passwordForm = this.fb.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
  });

  readonly generalForm = this.fb.group({
    language: ['es', [Validators.required]],
    currency: ['COP', [Validators.required]],
    dateFormat: ['DD/MM/YYYY', [Validators.required]],
  });

  ngOnInit(): void {
    // Hidrata datos frescos (incluye preferences en sesiones antiguas).
    this.authApi
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.session.updateUser(response.user);
          this.syncGeneralForm();
        },
        error: () => undefined,
      });

    this.syncGeneralForm();
  }

  fullName(): string {
    const user = this.user();
    if (!user) {
      return '';
    }
    return `${user.firstName} ${user.lastName}`.trim();
  }

  setLight(): void {
    if (this.isDark()) {
      this.theme.toggleTheme();
    }
  }

  setDark(): void {
    if (!this.isDark()) {
      this.theme.toggleTheme();
    }
  }

  // --- Perfil / Correo ---

  openProfile(): void {
    const user = this.user();
    this.error.set('');
    this.success.set('');
    this.profileForm.reset({
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      cellphoneNumber: user?.cellphoneNumber ?? '',
    });
    this.profileOpen.set(true);
  }

  async closeProfile(): Promise<void> {
    if (this.savingProfile()) {
      return;
    }

    if (this.profileForm.dirty) {
      const confirmed = await this.notificationModal.confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar en tu perfil.',
        type: 'warning',
        confirmText: 'Descartar',
      });

      if (!confirmed) {
        return;
      }
    }

    this.profileOpen.set(false);
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.savingProfile.set(true);
    this.error.set('');
    const raw = this.profileForm.getRawValue();

    this.authApi
      .updateProfile({
        firstName: raw.firstName,
        lastName: raw.lastName,
        email: raw.email,
        cellphoneNumber: this.phoneValue(raw.cellphoneNumber),
      })
      .pipe(
        finalize(() => this.savingProfile.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.session.updateUser(response.user);
          this.success.set('Perfil actualizado.');
          this.profileOpen.set(false);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  isProfileInvalid(controlName: keyof typeof this.profileForm.controls): boolean {
    const control = this.profileForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  // --- Contraseña ---

  openPassword(): void {
    this.error.set('');
    this.success.set('');
    this.passwordForm.reset({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    this.passwordOpen.set(true);
  }

  async closePassword(): Promise<void> {
    if (this.savingPassword()) {
      return;
    }

    if (this.passwordForm.dirty) {
      const confirmed = await this.notificationModal.confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar en el cambio de contrasena.',
        type: 'warning',
        confirmText: 'Descartar',
      });

      if (!confirmed) {
        return;
      }
    }

    this.passwordOpen.set(false);
  }

  savePassword(): void {
    const raw = this.passwordForm.getRawValue();

    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    if (raw.newPassword !== raw.confirmPassword) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }

    this.savingPassword.set(true);
    this.error.set('');

    this.authApi
      .changePassword({
        currentPassword: raw.currentPassword,
        newPassword: raw.newPassword,
      })
      .pipe(
        finalize(() => this.savingPassword.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.success.set('Contraseña actualizada.');
          this.passwordOpen.set(false);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  isPasswordInvalid(controlName: keyof typeof this.passwordForm.controls): boolean {
    const control = this.passwordForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  // --- Preferencias de notificaciones ---

  toggleNotification(key: keyof NotificationPreferences): void {
    if (this.savingNotifications()) {
      return;
    }

    const next = !this.notifications()[key];
    this.savingNotifications.set(true);
    this.error.set('');

    this.authApi
      .updateNotificationPreferences({ [key]: next })
      .pipe(
        finalize(() => this.savingNotifications.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.session.updateUser(response.user);
          this.success.set('Preferencias de notificaciones actualizadas.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  // --- Preferencias generales ---

  saveGeneral(): void {
    if (this.generalForm.invalid) {
      this.generalForm.markAllAsTouched();
      return;
    }

    this.savingGeneral.set(true);
    this.error.set('');

    this.authApi
      .updateGeneralPreferences(this.generalForm.getRawValue())
      .pipe(
        finalize(() => this.savingGeneral.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.session.updateUser(response.user);
          this.success.set('Preferencias generales actualizadas.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  private syncGeneralForm(): void {
    const general = this.general();
    this.generalForm.reset({
      language: general.language,
      currency: general.currency,
      dateFormat: general.dateFormat,
    });
  }

  private phoneValue(value: PhoneInputValue | string | null): string {
    if (!value) {
      return '';
    }
    return typeof value === 'string' ? value : value.e164;
  }
}
