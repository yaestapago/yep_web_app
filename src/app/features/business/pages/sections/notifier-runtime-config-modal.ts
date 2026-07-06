import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { finalize } from 'rxjs';

import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import type { Notifier } from '../../../../shared/models/notifier.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { NotifiersApiService } from '../../../notifiers/services/notifiers-api.service';

/**
 * Valida que el valor sea un entero dentro de `[min, max]`. El control es de
 * texto (lo que emite `yep-input`), así que parseamos y verificamos rango; los
 * mismos clamps los re-aplica el backend al entregar la config.
 */
function integerInRange(min: number, max: number) {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = String(control.value ?? '').trim();
    if (raw === '') return { required: true };
    const value = Number(raw);
    if (!Number.isInteger(value)) return { integer: true };
    if (value < min || value > max) return { range: { min, max } };
    return null;
  };
}

/**
 * Modal para editar el **override de cadencias** de un notificador concreto
 * (heartbeat, flush, WorkManager). Los campos vacíos/no editados heredan el
 * default global de flota. El cambio se propaga al dispositivo en el próximo
 * heartbeat vía el diff de `configVersion`, sin re-emparejar.
 *
 * La ventana "en línea" no se edita: el backend la deriva del heartbeat.
 */
@Component({
  selector: 'app-notifier-runtime-config-modal',
  imports: [ReactiveFormsModule, Button, Input, Modal],
  templateUrl: './notifier-runtime-config-modal.html',
  styleUrl: './business-sections.scss',
})
export class NotifierRuntimeConfigModal {
  private readonly api = inject(NotifiersApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notifications = inject(NotificationModalService);
  private readonly destroyRef = inject(DestroyRef);

  /** Notificador a configurar; su `runtimeConfig` efectivo prellena el form. */
  readonly notifier = input<Notifier | null>(null);
  readonly open = input(false);

  readonly closeRequested = output<void>();
  /** Emite el notificador actualizado tras guardar o restablecer. */
  readonly saved = output<Notifier>();

  readonly saving = signal(false);
  readonly resetting = signal(false);
  readonly error = signal('');

  /** Rangos permitidos (deben coincidir con los clamps del backend). */
  readonly limits = {
    heartbeat: { min: 60, max: 3600 },
    flush: { min: 15, max: 3600 },
    workManager: { min: 15, max: 1440 },
  } as const;

  readonly form = this.fb.group({
    heartbeatIntervalSeconds: [
      '',
      [integerInRange(this.limits.heartbeat.min, this.limits.heartbeat.max)],
    ],
    flushIntervalSeconds: [
      '',
      [integerInRange(this.limits.flush.min, this.limits.flush.max)],
    ],
    workManagerFallbackMinutes: [
      '',
      [integerInRange(this.limits.workManager.min, this.limits.workManager.max)],
    ],
  });

  /** ¿Este notificador ya tiene cadencias personalizadas (no hereda flota)? */
  readonly isCustomized = computed(() => Boolean(this.notifier()?.runtimeConfigOverride));

  /** `configVersion` efectivo (solo lectura) para referencia. */
  readonly configVersion = computed(() => this.notifier()?.runtimeConfig?.configVersion ?? '—');

  /** Ventana "en línea" derivada (solo lectura). */
  readonly onlineWindowSeconds = computed(
    () => this.notifier()?.runtimeConfig?.onlineWindowSeconds,
  );

  constructor() {
    // Al abrirse (o cambiar de notificador), prellena el form con la config
    // EFECTIVA actual: así el operador parte de lo que el dispositivo aplica hoy.
    effect(() => {
      if (!this.open()) return;
      const config = this.notifier()?.runtimeConfig;
      this.error.set('');
      this.form.reset({
        heartbeatIntervalSeconds: config ? String(config.heartbeatIntervalSeconds) : '',
        flushIntervalSeconds: config ? String(config.flushIntervalSeconds) : '',
        workManagerFallbackMinutes: config ? String(config.workManagerFallbackMinutes) : '',
      });
    });
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  fieldError(controlName: keyof typeof this.form.controls, unit: string): string {
    const control = this.form.controls[controlName];
    if (!this.isInvalid(controlName)) return '';
    if (control.hasError('required')) return 'Ingresa un valor';
    if (control.hasError('integer')) return 'Debe ser un número entero';
    const range = control.getError('range') as { min: number; max: number } | undefined;
    return range ? `Debe estar entre ${range.min} y ${range.max} ${unit}` : '';
  }

  save(): void {
    const notifier = this.notifier();
    if (!notifier) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set('');

    this.api
      .update(notifier.id, {
        runtimeConfigOverride: {
          heartbeatIntervalSeconds: Number(raw.heartbeatIntervalSeconds),
          flushIntervalSeconds: Number(raw.flushIntervalSeconds),
          workManagerFallbackMinutes: Number(raw.workManagerFallbackMinutes),
        },
      })
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.form.markAsPristine();
          this.saved.emit(response.notifier);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  async resetToFleet(): Promise<void> {
    const notifier = this.notifier();
    if (!notifier) return;
    const confirmed = await this.notifications.confirm({
      title: 'Restablecer a valores de flota',
      message:
        'Este notificador volverá a usar las cadencias globales. Se aplicará en el próximo latido.',
      type: 'warning',
      confirmText: 'Restablecer',
    });
    if (!confirmed) return;

    this.resetting.set(true);
    this.error.set('');

    this.api
      .update(notifier.id, { runtimeConfigOverride: null })
      .pipe(
        finalize(() => this.resetting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.form.markAsPristine();
          this.saved.emit(response.notifier);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  async close(): Promise<void> {
    if (this.saving() || this.resetting()) return;
    if (this.form.dirty) {
      const confirmed = await this.notifications.confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar en la configuración.',
        type: 'warning',
        confirmText: 'Descartar',
      });
      if (!confirmed) return;
    }
    this.closeRequested.emit();
  }
}
