import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideClipboardCheck,
  LucideClipboardCopy,
  LucideLink,
  LucideLoaderCircle,
  LucidePencil,
  LucidePlus,
  LucideRefreshCw,
  LucideSettings,
  LucideTrash2,
  LucideUnlink,
} from '@lucide/angular';
import { finalize, interval } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { Button } from '../../../../shared/ui/button/button';
import { Checkbox } from '../../../../shared/ui/checkbox/checkbox';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import {
  RadioSelectionList,
  type RadioSelectionOption,
} from '../../../../shared/ui/radio-selection-list/radio-selection-list';
import { StatusDot } from '../../../../shared/ui/status-dot/status-dot';
import { Toggle } from '../../../../shared/ui/toggle/toggle';
import { NotifierRuntimeConfigModal } from './notifier-runtime-config-modal';
import type { BankAccount } from '../../../../shared/models/bank-account.models';
import type { BankPickerEntry } from '../../../../shared/models/bank.models';
import type {
  Notifier,
  NotifierKind,
  NotifierType,
} from '../../../../shared/models/notifier.models';
import {
  NOTIFIER_STATUS_THRESHOLDS,
  computeNotifierStatus,
  relativeFromMs,
  type NotifierStatus,
  type NotifierStatusLevel,
} from '../../../../shared/utils/notifier-status';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BanksApiService } from '../../../banks/services/banks-api.service';
import { NotifiersApiService } from '../../../notifiers/services/notifiers-api.service';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

interface NotifierKindOption {
  value: NotifierKind;
  label: string;
  description: string;
  disabled: boolean;
  /** Etiqueta corta junto al nombre cuando la opción no está disponible. */
  badge?: string;
}

@Component({
  selector: 'app-business-notifiers-section',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    Button,
    Checkbox,
    Input,
    Modal,
    RadioSelectionList,
    StatusDot,
    Toggle,
    NotifierRuntimeConfigModal,
    LucideClipboardCheck,
    LucideClipboardCopy,
    LucideLink,
    LucideLoaderCircle,
    LucidePencil,
    LucidePlus,
    LucideRefreshCw,
    LucideSettings,
    LucideTrash2,
    LucideUnlink,
  ],
  templateUrl: './business-notifiers.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessNotifiersSection implements OnInit {
  private readonly notifiersApi = inject(NotifiersApiService);
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly banksApi = inject(BanksApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notifications = inject(NotificationModalService);
  readonly thresholds = inject(NOTIFIER_STATUS_THRESHOLDS);

  readonly businessId = this.session.activeBusinessAccountId;
  readonly notifiers = signal<Notifier[]>([]);
  readonly bankAccounts = signal<BankAccount[]>([]);
  /** Catálogo de bancos por `code` para saber qué cuentas soportan teléfono. */
  private readonly banksByCode = signal<Map<string, BankPickerEntry>>(new Map());
  readonly selectedBankAccountIds = signal<string[]>([]);
  readonly selectedAllowedBreBKeys = signal<string[]>([]);
  readonly loading = signal(false);
  readonly creating = signal(false);
  readonly actingId = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly modalOpen = signal(false);
  readonly senderPatternsCopied = signal(false);

  /** Notificador cuyo modal de cadencias está abierto (null = cerrado). */
  readonly configNotifier = signal<Notifier | null>(null);
  readonly configModalOpen = signal(false);

  /**
   * Opciones de tipo mostradas como radio buttons al crear un notificador.
   * "Correo" solo está disponible si el dueño tiene al menos una cuenta de un
   * banco que lo permita (hoy, Bancolombia); en el futuro pueden ser otros.
   */
  readonly kindOptions = computed<NotifierKindOption[]>(() => {
    const emailDisabled = !this.hasEmailEligibleAccount();
    const eligibleNames = this.emailEligibleBankNames();
    return [
      {
        value: 'phone',
        label: 'Teléfono',
        description: 'Recibe pagos desde la app móvil emparejada.',
        disabled: false,
      },
      {
        value: 'desktop',
        label: 'Escritorio',
        description: 'Recibe pagos desde la app de escritorio (Vínculo con Windows).',
        disabled: false,
      },
      {
        value: 'email',
        label: 'Correo',
        description: emailDisabled
          ? `Necesitas una cuenta de: ${eligibleNames.join(', ') || 'un banco compatible'}.`
          : 'Reenvía los correos del banco a un alias y los registramos.',
        disabled: emailDisabled,
        badge: emailDisabled ? 'Requiere cuenta compatible' : undefined,
      },
    ];
  });

  readonly kindSelectionOptions = computed<RadioSelectionOption[]>(() =>
    this.kindOptions().map((option) => ({
      id: option.value,
      name: option.label,
      description: option.description,
      disabled: option.disabled,
      tag: option.badge,
      halfWidth: option.value !== 'email',
    })),
  );

  /** Tick para recalcular el estado relativo sin recargar la página. */
  private readonly now = signal(Date.now());

  /** Tick de 1s para animar la cuenta regresiva del código de emparejamiento. */
  private readonly tick = signal(Date.now());

  /** Tiempo (ms) que el código de emparejamiento permanece visible. */
  private readonly CODE_REVEAL_MS = 60_000;
  /** Circunferencia del anillo (r=9) para el dibujo SVG de la cuenta regresiva. */
  readonly ringCircumference = 2 * Math.PI * 9;

  /** notifierId -> epoch ms en que se oculta el código revelado. */
  private readonly revealedUntil = signal<Map<string, number>>(new Map());

  readonly canManage = computed(
    () =>
      this.session.activeMembership()?.role === 'account_owner' ||
      this.session.user()?.globalRole === 'account_su',
  );

  /** Cuentas activas elegibles para el selector. */
  readonly selectableAccounts = computed(() =>
    this.bankAccounts().filter((account) => account.isActive),
  );

  /** Nombres de los bancos que hoy permiten notificador de correo. */
  readonly emailEligibleBankNames = computed(() =>
    Array.from(this.banksByCode().values())
      .filter((bank) => bank.email?.enabled)
      .map((bank) => bank.name),
  );

  /**
   * ¿Hay al menos una cuenta activa de un banco que permita correo? Si el
   * catálogo aún no cargó, no bloqueamos: dejamos que el backend valide.
   */
  readonly hasEmailEligibleAccount = computed(() => {
    const banks = this.banksByCode();
    if (banks.size === 0) return true;
    return this.selectableAccounts().some((account) => banks.get(account.bankId)?.email?.enabled);
  });

  /** Remitentes oficiales del banco para que el usuario arme su filtro de Gmail. */
  readonly selectedEmailSenderPatterns = computed(() => {
    const selectedIds = new Set(this.selectedBankAccountIds());
    const bankIds = Array.from(
      new Set(
        this.bankAccounts()
          .filter((account) => selectedIds.has(account.id))
          .map((account) => account.bankId),
      ),
    );
    return Array.from(
      new Set(
        bankIds.flatMap((bankId) => this.banksByCode().get(bankId)?.email?.senderPatterns ?? []),
      ),
    );
  });

  readonly selectedEmailSenderPatternsText = computed(() =>
    this.selectedEmailSenderPatterns().join('\n'),
  );

  readonly selectedBreBKeyOptions = computed(() => {
    const selectedIds = new Set(this.selectedBankAccountIds());
    return this.bankAccounts()
      .filter((account) => selectedIds.has(account.id))
      .flatMap((account) =>
        (account.breBKeys ?? []).map((key) => ({
          key,
          account,
        })),
      );
  });

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
    kind: ['phone' as NotifierKind, [Validators.required]],
    displayName: ['', [Validators.required, Validators.maxLength(120)]],
    // Solo para `email`: correo remitente desde el que se reenviarán las
    // notificaciones del banco. El validador `required` se activa/desactiva
    // según el tipo seleccionado (ver `ngOnInit`).
    senderEmail: ['', [Validators.email, Validators.maxLength(200)]],
  });

  /** Tipo seleccionado, como signal para conducir el render zoneless. */
  readonly selectedKind = toSignal(this.form.controls.kind.valueChanges, {
    initialValue: this.form.controls.kind.value,
  });

  /** Teléfono y Escritorio monitorean cuentas y se emparejan; el correo no. */
  readonly isEmailKind = computed(() => this.selectedKind() === 'email');
  readonly supportsBreBKeySelection = computed(
    () => this.selectedKind() === 'email' || this.selectedKind() === 'phone',
  );
  readonly monitorsBanks = computed(() => !this.isEmailKind());

  readonly modalSubtitle = computed(() => {
    if (this.editingId()) {
      return 'Actualiza la configuración de este notificador.';
    }
    switch (this.selectedKind()) {
      case 'email':
        return 'Registra el correo desde el que reenviarás las notificaciones del banco. Te daremos un alias al que reenviarlas.';
      case 'desktop':
        return 'Selecciona las cuentas que la app de escritorio va a monitorear.';
      default:
        return 'Selecciona las cuentas que este notificador va a monitorear. La configuración de cada banco se aplicará automáticamente.';
    }
  });

  ngOnInit(): void {
    this.load();
    this.loadBankAccounts();
    this.loadBanks();

    // El correo remitente solo es obligatorio para notificadores de correo.
    this.form.controls.kind.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((kind) => {
        const control = this.form.controls.senderEmail;
        if (kind === 'email') {
          control.addValidators(Validators.required);
        } else {
          control.removeValidators(Validators.required);
          control.setValue('');
        }
        control.updateValueAndValidity();
        if (!this.editingId()) {
          this.selectedAllowedBreBKeys.set(
            kind === 'email' || kind === 'phone'
              ? this.selectedBreBKeyOptions().map((option) => option.key)
              : [],
          );
        }
      });

    // Refresco periódico: recalcula el tick y vuelve a pedir los notifiers.
    interval(this.thresholds.refreshIntervalMs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.now.set(Date.now());
        this.refresh();
      });

    // Tick de 1s para la cuenta regresiva del código de emparejamiento.
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.tick.set(Date.now()));
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

  loadBankAccounts(): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }
    this.businessApi
      .listBankAccounts(businessId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.bankAccounts.set(response.bankAccounts),
        error: () => this.bankAccounts.set([]),
      });
  }

  loadBanks(): void {
    this.banksApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) =>
          this.banksByCode.set(new Map(response.banks.map((bank) => [bank.code, bank]))),
        error: () => this.banksByCode.set(new Map()),
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
    this.senderPatternsCopied.set(false);
    this.editingId.set(null);
    this.selectedBankAccountIds.set([]);
    this.selectedAllowedBreBKeys.set([]);
    this.form.reset({ kind: 'phone', displayName: '', senderEmail: '' });
    this.loadBankAccounts();
    this.modalOpen.set(true);
  }

  openEdit(notifier: Notifier): void {
    this.error.set('');
    this.success.set('');
    this.senderPatternsCopied.set(false);
    this.editingId.set(notifier.id);
    this.selectedBankAccountIds.set([...notifier.bankAccountIds]);
    this.selectedAllowedBreBKeys.set(
      (notifier.allowedBreBKeys ?? []).length > 0
        ? [...notifier.allowedBreBKeys]
        : notifier.bankAccounts.flatMap((account) => account.breBKeys ?? []),
    );
    this.form.reset({
      kind: this.typeToKind(notifier.type),
      displayName: notifier.displayName ?? '',
      senderEmail: notifier.identifier ?? '',
    });
    this.loadBankAccounts();
    this.modalOpen.set(true);
  }

  /** Abre el modal de cadencias (heartbeat/flush/WorkManager) del notificador. */
  openConfig(notifier: Notifier): void {
    this.error.set('');
    this.success.set('');
    this.configNotifier.set(notifier);
    this.configModalOpen.set(true);
  }

  closeConfig(): void {
    this.configModalOpen.set(false);
    this.configNotifier.set(null);
  }

  /** El modal guardó/restableció: actualiza la tarjeta y muestra el éxito. */
  onConfigSaved(updated: Notifier): void {
    this.notifiers.update((notifiers) =>
      notifiers.map((current) => (current.id === updated.id ? updated : current)),
    );
    this.success.set('Guardado. Los dispositivos lo aplicarán en el próximo latido.');
    this.now.set(Date.now());
    this.closeConfig();
  }

  private kindToType(kind: NotifierKind): NotifierType {
    switch (kind) {
      case 'email':
        return 'email_gmail';
      case 'desktop':
        return 'desktop_app';
      default:
        return 'phone_app';
    }
  }

  private typeToKind(type: NotifierType): NotifierKind {
    switch (type) {
      case 'email_gmail':
        return 'email';
      case 'desktop_app':
        return 'desktop';
      default:
        return 'phone';
    }
  }

  /** ¿Este notificador usa emparejamiento de dispositivo (no el de correo)? */
  usesPairing(notifier: Notifier): boolean {
    return notifier.type !== 'email_gmail';
  }

  async closeModal(): Promise<void> {
    if (this.creating()) {
      return;
    }

    if (this.form.dirty) {
      const confirmed = await this.notifications.confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar en el notificador.',
        type: 'warning',
        confirmText: 'Descartar',
      });

      if (!confirmed) {
        return;
      }
    }

    this.modalOpen.set(false);
  }

  /** Canal de config del banco según el tipo (kind) seleccionado. */
  private channelForKind(): 'mobile' | 'email' | 'desk' {
    const kind = this.selectedKind();
    if (kind === 'email') return 'email';
    if (kind === 'desktop') return 'desk';
    return 'mobile';
  }

  /** Etiqueta legible del tipo seleccionado (para mensajes). */
  private kindLabel(): string {
    const kind = this.selectedKind();
    return kind === 'email' ? 'de correo' : kind === 'desktop' ? 'de escritorio' : 'móvil';
  }

  /** Tope de cuentas de este banco por notificador para el canal actual. */
  private bankLimit(bankId: string): number | undefined {
    return this.banksByCode().get(bankId)?.accountLimits?.[this.channelForKind()];
  }

  /** ¿El banco de esta cuenta soporta el canal del tipo seleccionado? */
  isBankEligible(account: BankAccount): boolean {
    const entry = this.banksByCode().get(account.bankId);
    // Si el catálogo aún no cargó o el banco no está listado, deja que el
    // backend valide; solo bloqueamos cuando sabemos que NO está disponible.
    // (El picker expone `phone`/`email`; escritorio reutiliza `phone`.)
    if (this.isEmailKind()) {
      return entry ? Boolean(entry.email?.enabled) : true;
    }
    return entry ? Boolean(entry.phone?.enabled) : true;
  }

  /**
   * ¿La cuenta ya está en OTRO notificador del mismo tipo? Solo cuenta cuando el
   * banco exige exclusividad (tope = 1) para el canal. Excluye el notificador en
   * edición. Refleja la validación de exclusividad del backend.
   */
  private usedByOtherNotifier(account: BankAccount): boolean {
    if (this.bankLimit(account.bankId) !== 1) return false;
    const type = this.kindToType(this.selectedKind());
    const editing = this.editingId();
    return this.notifiers().some(
      (n) => n.type === type && n.id !== editing && (n.bankAccountIds ?? []).includes(account.id),
    );
  }

  /**
   * Motivo por el que una cuenta NO se puede seleccionar para el tipo actual, o
   * `null` si sí. Combina: canal no soportado, exclusividad (ya usada) y tope de
   * cuentas por notificador ya alcanzado con otra(s) cuenta(s) del mismo banco.
   */
  accountBlockedReason(account: BankAccount): string | null {
    if (!this.isBankEligible(account)) {
      return this.isEmailKind()
        ? 'Esta cuenta todavía no permite un notificador de correo.'
        : 'Esta cuenta todavía no está disponible para monitoreo desde este canal.';
    }
    if (this.usedByOtherNotifier(account)) {
      return `Ya asignada a otro notificador ${this.kindLabel()}.`;
    }
    const limit = this.bankLimit(account.bankId);
    if (limit !== undefined && !this.isSelected(account.id)) {
      const selectedSameBank = this.selectedBankAccountIds().filter((id) => {
        const acc = this.bankAccounts().find((a) => a.id === id);
        return acc?.bankId === account.bankId;
      }).length;
      if (selectedSameBank >= limit) {
        const bankName = this.banksByCode().get(account.bankId)?.name ?? account.bankId;
        return limit === 1
          ? `${bankName} permite una sola cuenta por notificador.`
          : `Máximo ${limit} cuentas de ${bankName} por notificador.`;
      }
    }
    return null;
  }

  isAccountBlocked(account: BankAccount): boolean {
    return this.accountBlockedReason(account) !== null;
  }

  toggleAccount(accountId: string, checked: boolean): void {
    if (checked) {
      const account = this.bankAccounts().find((a) => a.id === accountId);
      // Defensa: no agregar una cuenta bloqueada (el checkbox ya va disabled).
      if (account && this.accountBlockedReason(account)) return;
    }
    this.selectedBankAccountIds.update((ids) =>
      checked ? Array.from(new Set([...ids, accountId])) : ids.filter((id) => id !== accountId),
    );
    this.syncSelectedBreBKeysAfterAccountToggle(accountId, checked);
  }

  isSelected(accountId: string): boolean {
    return this.selectedBankAccountIds().includes(accountId);
  }

  toggleBreBKey(key: string, checked: boolean): void {
    this.selectedAllowedBreBKeys.update((keys) =>
      checked ? Array.from(new Set([...keys, key])) : keys.filter((current) => current !== key),
    );
  }

  isBreBKeySelected(key: string): boolean {
    return this.selectedAllowedBreBKeys().includes(key);
  }

  selectAllBreBKeys(): void {
    this.selectedAllowedBreBKeys.set(
      this.selectedBreBKeyOptions().map((option) => option.key),
    );
  }

  private syncSelectedBreBKeysAfterAccountToggle(accountId: string, checked: boolean): void {
    if (!this.supportsBreBKeySelection()) return;
    const account = this.bankAccounts().find((current) => current.id === accountId);
    const keys = account?.breBKeys ?? [];
    if (checked) {
      this.selectedAllowedBreBKeys.update((selected) =>
        Array.from(new Set([...selected, ...keys])),
      );
      return;
    }
    this.selectedAllowedBreBKeys.update((selected) =>
      selected.filter((key) => !keys.includes(key)),
    );
  }

  private selectedBreBKeyPayload(): string[] | undefined {
    if (!this.supportsBreBKeySelection()) return undefined;
    const available = this.selectedBreBKeyOptions().map((option) => option.key);
    const selected = this.selectedAllowedBreBKeys().filter((key) => available.includes(key));
    if (available.length === 0 || selected.length === available.length) {
      return this.editingId() && available.length > 0 ? [] : undefined;
    }
    return selected;
  }

  copyEmailSenderPatterns(): void {
    const value = this.selectedEmailSenderPatternsText();
    if (!value) return;
    void navigator.clipboard?.writeText(value).then(() => {
      this.senderPatternsCopied.set(true);
      setTimeout(() => this.senderPatternsCopied.set(false), 1500);
    });
  }

  accountTypeLabel(account: BankAccount): string {
    switch (account.accountType) {
      case 'savings':
        return 'Ahorros';
      case 'checking':
        return 'Corriente';
      case 'wallet':
        return 'Billetera';
      case 'other':
        return 'Otro';
      default:
        return '';
    }
  }

  bankName(account: BankAccount): string {
    return this.banksByCode().get(account.bankId)?.name ?? account.bankId;
  }

  save(): void {
    const kind = this.form.controls.kind.value;
    const isEmail = kind === 'email';
    const supportsBreBKeySelection = kind === 'email' || kind === 'phone';
    const bankAccountIds = this.selectedBankAccountIds();

    // Tanto monitoreo (teléfono/escritorio) como correo requieren ahora al menos
    // una cuenta: el correo solo se permite sobre un banco compatible (Bancolombia).
    if (this.form.invalid || bankAccountIds.length === 0) {
      this.form.markAllAsTouched();
      if (bankAccountIds.length === 0) {
        this.error.set(
          isEmail
            ? 'Selecciona la cuenta bancaria a la que llegan estos correos.'
            : 'Selecciona al menos una cuenta para monitorear.',
        );
      }
      return;
    }

    const allowedBreBKeys = this.selectedBreBKeyPayload();
    if (
      supportsBreBKeySelection &&
      this.selectedBreBKeyOptions().length > 0 &&
      allowedBreBKeys?.length === 0
    ) {
      this.error.set('Selecciona al menos una llave Bre-B para este notificador.');
      return;
    }

    const displayName = this.form.controls.displayName.value.trim();
    const senderEmail = this.form.controls.senderEmail.value.trim();
    this.creating.set(true);
    this.error.set('');

    const editingId = this.editingId();
    const request$ = editingId
      ? this.notifiersApi.update(
          editingId,
          isEmail
            ? {
                displayName,
                identifier: senderEmail,
                identifierType: 'email',
                bankAccountIds,
                ...(allowedBreBKeys !== undefined ? { allowedBreBKeys } : {}),
              }
            : {
                displayName,
                bankAccountIds,
                ...(supportsBreBKeySelection && allowedBreBKeys !== undefined
                  ? { allowedBreBKeys }
                  : {}),
              },
        )
      : this.notifiersApi.create(
          isEmail
            ? {
                type: 'email_gmail',
                displayName,
                identifier: senderEmail,
                identifierType: 'email',
                bankAccountIds,
                ...(allowedBreBKeys !== undefined ? { allowedBreBKeys } : {}),
              }
            : {
                type: this.kindToType(kind),
                displayName,
                bankAccountIds,
                ...(supportsBreBKeySelection && allowedBreBKeys !== undefined
                  ? { allowedBreBKeys }
                  : {}),
              },
        );

    request$
      .pipe(
        finalize(() => this.creating.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          if (editingId) {
            this.notifiers.update((notifiers) =>
              notifiers.map((current) =>
                current.id === response.notifier.id ? response.notifier : current,
              ),
            );
            this.success.set('Cambios guardados. Se sincronizarán con tu app móvil.');
          } else {
            this.notifiers.update((notifiers) => [response.notifier, ...notifiers]);
            if (response.notifier.type === 'email_gmail') {
              const alias = response.notifier.inboundAlias;
              this.success.set(
                alias
                  ? `Notificador de correo creado. Reenvía los correos del banco a ${alias}.`
                  : 'Notificador de correo creado.',
              );
            } else {
              this.success.set(
                'Notificador creado. Ingresa el código en tu dispositivo para emparejar.',
              );
              this.revealCode(response.notifier);
            }
          }
          this.now.set(Date.now());
          this.modalOpen.set(false);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  toggleActive(notifier: Notifier): void {
    this.runAction(notifier, notifier.active ? 'deactivate' : 'activate');
  }

  async unpair(notifier: Notifier): Promise<void> {
    const confirmed = await this.notifications.confirm({
      title: 'Desemparejar dispositivo',
      message: 'El dispositivo actual dejara de enviar notificaciones a este negocio.',
      type: 'warning',
      confirmText: 'Desemparejar',
    });
    if (!confirmed) {
      return;
    }
    this.runAction(notifier, 'unpair');
  }

  async remove(notifier: Notifier): Promise<void> {
    const confirmed = await this.notifications.confirm({
      title: 'Eliminar notificador',
      message: 'Esta accion no se puede deshacer.',
      type: 'error',
      confirmText: 'Eliminar',
    });
    if (!confirmed) {
      return;
    }
    this.actingId.set(notifier.id);
    this.error.set('');
    this.success.set('');

    this.notifiersApi
      .remove(notifier.id)
      .pipe(
        finalize(() => this.actingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.notifiers.update((notifiers) =>
            notifiers.filter((current) => current.id !== notifier.id),
          );
          this.hideCode(notifier.id);
          this.success.set('Notificador eliminado.');
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  /** Muestra el código de emparejamiento junto al nombre por unos segundos. */
  revealCode(notifier: Notifier): void {
    if (!notifier.accessCode) {
      return;
    }
    this.revealedUntil.update((map) =>
      new Map(map).set(notifier.id, Date.now() + this.CODE_REVEAL_MS),
    );
    this.tick.set(Date.now());
  }

  hideCode(id: string): void {
    this.revealedUntil.update((map) => {
      if (!map.has(id)) {
        return map;
      }
      const next = new Map(map);
      next.delete(id);
      return next;
    });
  }

  /** ¿El código sigue visible? Se oculta al expirar o al emparejarse. */
  isCodeVisible(notifier: Notifier): boolean {
    if (!this.usesPairing(notifier) || notifier.pairedDevice || !notifier.accessCode) {
      return false;
    }
    const until = this.revealedUntil().get(notifier.id);
    return until !== undefined && this.tick() < until;
  }

  /** stroke-dashoffset del anillo: 0 lleno → circunferencia vacío. */
  codeRingOffset(notifier: Notifier): number {
    const until = this.revealedUntil().get(notifier.id);
    if (until === undefined) {
      return this.ringCircumference;
    }
    const fraction = Math.max(0, (until - this.tick()) / this.CODE_REVEAL_MS);
    return this.ringCircumference * (1 - fraction);
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

  private runAction(notifier: Notifier, action: 'activate' | 'deactivate' | 'unpair'): void {
    this.actingId.set(notifier.id);
    this.error.set('');
    this.success.set('');

    const request =
      action === 'activate'
        ? this.notifiersApi.activate(notifier.id)
        : action === 'deactivate'
          ? this.notifiersApi.deactivate(notifier.id)
          : this.notifiersApi.unpair(notifier.id);

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
}
