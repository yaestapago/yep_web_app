import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideLock } from '@lucide/angular';
import { finalize } from 'rxjs';

import { Alert, Button, Card, Input, State, StatusChip } from '../../../../shared/ui';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { formatDateTime } from '../../../../shared/utils/billing-format';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import {
  NotifierSupportPinApiService,
  type NotifierSupportPinStatus,
} from '../../services/notifier-support-pin-api.service';

export const SUPPORT_PIN_PATTERN = /^\d{6,8}$/;

export interface SupportPinFormErrors {
  pin?: string;
  confirm?: string;
}

/** Reglas del contrato (solo dígitos, 6 a 8) y que la confirmación coincida. */
export function validateSupportPin(pin: string, confirm: string): SupportPinFormErrors {
  const errors: SupportPinFormErrors = {};
  if (!pin) errors.pin = 'Escribe el PIN.';
  else if (!SUPPORT_PIN_PATTERN.test(pin)) errors.pin = 'Solo números, de 6 a 8 dígitos.';
  if (!confirm) errors.confirm = 'Repite el PIN.';
  else if (!errors.pin && confirm !== pin) errors.confirm = 'Los dos PIN no coinciden.';
  return errors;
}

/**
 * Tarjeta «PIN de soporte del Notificador» (superadmin): dice si hay PIN y cuándo se
 * cambió, y permite fijarlo o cambiarlo. El PIN lo pide el Notificador en Configuración →
 * Modo soporte; el backend solo guarda su hash y nunca lo devuelve.
 */
@Component({
  selector: 'app-notifier-support-pin',
  imports: [FormsModule, Alert, Button, Card, Input, State, StatusChip, LucideLock],
  templateUrl: './notifier-support-pin.html',
  styleUrl: './notifier-support-pin.scss',
})
export class NotifierSupportPin implements OnInit {
  private readonly api = inject(NotifierSupportPinApiService);
  private readonly notifications = inject(NotificationModalService);
  private readonly destroyRef = inject(DestroyRef);

  readonly status = signal<NotifierSupportPinStatus | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal('');
  /** El formulario se abre solo al tocar «Cambiar PIN» si ya hay uno. */
  readonly editing = signal(false);
  readonly pin = signal('');
  readonly confirm = signal('');
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly success = signal('');

  readonly configured = computed(() => this.status()?.configured === true);
  readonly showForm = computed(() => !!this.status() && (!this.configured() || this.editing()));
  readonly errors = computed(() => validateSupportPin(this.pin(), this.confirm()));
  readonly pinError = computed(() => (this.submitted() ? (this.errors().pin ?? '') : ''));
  readonly confirmError = computed(() => (this.submitted() ? (this.errors().confirm ?? '') : ''));
  readonly updatedLabel = computed(() => {
    const status = this.status();
    if (!status?.configured) {
      return 'Todavía no hay PIN: nadie puede abrir el modo soporte.';
    }
    const at = formatDateTime(status.updatedAt);
    return at ? `Configurado. Último cambio: ${at}.` : 'Configurado.';
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api
      .status()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (status) => this.status.set(status),
        error: (error) => this.loadError.set(httpErrorMessage(error)),
      });
  }

  startEditing(): void {
    this.resetForm();
    this.success.set('');
    this.editing.set(true);
  }

  cancel(): void {
    this.resetForm();
    this.editing.set(false);
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    this.saveError.set('');
    this.success.set('');
    if (Object.keys(this.errors()).length > 0) return;

    if (this.configured()) {
      const confirmed = await this.notifications.confirm({
        title: 'Cambiar el PIN de soporte',
        message:
          'El PIN anterior deja de servir en todos los celulares. Avísale al equipo el nuevo.',
        type: 'warning',
        confirmText: 'Cambiar PIN',
        cancelText: 'Cancelar',
      });
      if (!confirmed) return;
    }

    this.saving.set(true);
    this.api
      .setPin(this.pin())
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (status) => {
          this.status.set(status);
          this.resetForm();
          this.editing.set(false);
          this.success.set('PIN guardado. Compártelo solo con el equipo de YEP.');
        },
        error: (error) => this.saveError.set(httpErrorMessage(error)),
      });
  }

  private resetForm(): void {
    this.pin.set('');
    this.confirm.set('');
    this.submitted.set(false);
    this.saveError.set('');
  }
}
