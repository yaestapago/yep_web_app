import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideLoaderCircle, LucidePlus, LucideRefreshCw } from '@lucide/angular';
import { finalize, interval } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { StatusDot } from '../../../../shared/ui/status-dot/status-dot';
import type { Notifier, NotifierIdentifierType } from '../../../../shared/models/notifier.models';
import {
  NOTIFIER_STATUS_THRESHOLDS,
  computeNotifierStatus,
  relativeFromMs,
  type NotifierStatus,
  type NotifierStatusLevel,
} from '../../../../shared/utils/notifier-status';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { NotifiersApiService } from '../../../notifiers/services/notifiers-api.service';

@Component({
  selector: 'app-business-notifiers-section',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    Button,
    Input,
    Modal,
    StatusDot,
    LucideLoaderCircle,
    LucidePlus,
    LucideRefreshCw,
  ],
  templateUrl: './business-notifiers.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessNotifiersSection implements OnInit {
  private readonly notifiersApi = inject(NotifiersApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly thresholds = inject(NOTIFIER_STATUS_THRESHOLDS);

  readonly notifiers = signal<Notifier[]>([]);
  readonly loading = signal(false);
  readonly creating = signal(false);
  readonly actingId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly modalOpen = signal(false);

  /** Tick para recalcular el estado relativo sin recargar la página. */
  private readonly now = signal(Date.now());

  readonly canManage = computed(
    () =>
      this.session.activeMembership()?.role === 'account_owner' ||
      this.session.user()?.globalRole === 'account_su',
  );

  readonly statuses = computed<Array<{ notifier: Notifier; status: NotifierStatus }>>(() => {
    const now = this.now();
    return this.notifiers().map((notifier) => ({
      notifier,
      status: computeNotifierStatus(notifier, this.thresholds, now),
    }));
  });

  readonly counts = computed(() => {
    const base: Record<NotifierStatusLevel, number> = {
      online: 0,
      delayed: 0,
      offline: 0,
      unknown: 0,
    };
    for (const { status } of this.statuses()) {
      base[status.level] += 1;
    }
    return base;
  });

  readonly form = this.fb.group({
    displayName: ['', [Validators.required, Validators.maxLength(120)]],
    identifier: [''],
    identifierType: ['phone' as NotifierIdentifierType],
    bankIds: ['nequi'],
    watchedPackages: ['com.nequi.mobileapp\ncom.nequi.app'],
  });

  ngOnInit(): void {
    this.load();

    // Refresco periódico: recalcula el tick y vuelve a pedir los notifiers.
    interval(this.thresholds.refreshIntervalMs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.now.set(Date.now());
        this.refresh();
      });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.notifiersApi
      .list()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.notifiers.set(response.notifiers);
          this.now.set(Date.now());
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  /** Recarga silenciosa (sin spinner global) para el auto-refresco. */
  refresh(): void {
    this.notifiersApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.notifiers.set(response.notifiers),
        error: () => undefined,
      });
  }

  openCreate(): void {
    this.error.set('');
    this.success.set('');
    this.form.reset({
      displayName: '',
      identifier: '',
      identifierType: 'phone',
      bankIds: 'nequi',
      watchedPackages: 'com.nequi.mobileapp\ncom.nequi.app',
    });
    this.modalOpen.set(true);
  }

  closeModal(): void {
    if (this.creating()) {
      return;
    }
    this.modalOpen.set(false);
  }

  create(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const identifier = this.optional(raw.identifier);
    const request = {
      displayName: this.optional(raw.displayName),
      identifier,
      identifierType: identifier
        ? identifier.includes('@')
          ? ('email' as NotifierIdentifierType)
          : raw.identifierType
        : undefined,
      bankIds: this.toList(raw.bankIds),
      watchedPackages: this.toList(raw.watchedPackages),
    };

    this.creating.set(true);
    this.error.set('');

    this.notifiersApi
      .create(request)
      .pipe(
        finalize(() => this.creating.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.notifiers.update((notifiers) => [response.notifier, ...notifiers]);
          this.now.set(Date.now());
          this.success.set(
            `Notificador creado. Código de emparejamiento: ${response.notifier.accessCode}`,
          );
          this.modalOpen.set(false);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  activate(notifier: Notifier): void {
    this.runAction(notifier, 'activate');
  }

  deactivate(notifier: Notifier): void {
    this.runAction(notifier, 'deactivate');
  }

  unpair(notifier: Notifier): void {
    if (!confirm('¿Desemparejar el dispositivo actual de este notificador?')) {
      return;
    }
    this.runAction(notifier, 'unpair');
  }

  remove(notifier: Notifier): void {
    if (!confirm('¿Desactivar y desemparejar este notificador?')) {
      return;
    }
    this.runAction(notifier, 'remove');
  }

  relative(status: NotifierStatus): string {
    return relativeFromMs(status.sinceMs);
  }

  deviceLabel(notifier: Notifier): string {
    if (!notifier.pairedDevice) {
      return 'Sin dispositivo';
    }
    return (
      [notifier.pairedDevice.manufacturer, notifier.pairedDevice.model].filter(Boolean).join(' ') ||
      notifier.pairedDevice.deviceId
    );
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  private runAction(
    notifier: Notifier,
    action: 'activate' | 'deactivate' | 'unpair' | 'remove',
  ): void {
    this.actingId.set(notifier.id);
    this.error.set('');
    this.success.set('');

    const request =
      action === 'activate'
        ? this.notifiersApi.activate(notifier.id)
        : action === 'deactivate'
          ? this.notifiersApi.deactivate(notifier.id)
          : action === 'unpair'
            ? this.notifiersApi.unpair(notifier.id)
            : this.notifiersApi.remove(notifier.id);

    request
      .pipe(
        finalize(() => this.actingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.notifiers.update((notifiers) =>
            notifiers.map((current) =>
              current.id === response.notifier.id ? response.notifier : current,
            ),
          );
          this.success.set('Notificador actualizado.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  private optional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private toList(value: string): string[] | undefined {
    const items = value
      .split(/[\n,]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    return items.length > 0 ? Array.from(new Set(items)) : undefined;
  }
}
