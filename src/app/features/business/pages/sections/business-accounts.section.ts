import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideLoaderCircle, LucidePlus, LucideRefreshCw } from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { SubscriptionCreationPermissionResponse } from '../../../../shared/models/auth.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Checkbox } from '../../../../shared/ui/checkbox/checkbox';
import { IconButton } from '../../../../shared/ui/icon-button/icon-button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { Select, type SelectOption } from '../../../../shared/ui/select/select';
import type {
  BankAccount,
  BankAccountType,
  BusinessLocation,
} from '../../../../shared/models/bank-account.models';
import type { BankPickerEntry, SupportedAccountType } from '../../../../shared/models/bank.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BanksApiService } from '../../../banks/services/banks-api.service';
import { SubscriptionsApiService } from '../../../subscription/services/subscriptions-api.service';
import { BusinessAccountsApiService } from '../../services/business-accounts-api.service';

@Component({
  selector: 'app-business-accounts-section',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Alert,
    Button,
    Checkbox,
    IconButton,
    Input,
    Modal,
    Select,
    LucideLoaderCircle,
    LucidePlus,
    LucideRefreshCw,
  ],
  templateUrl: './business-accounts.section.html',
  styleUrl: './business-sections.scss',
})
export class BusinessAccountsSection implements OnInit {
  private readonly businessApi = inject(BusinessAccountsApiService);
  private readonly banksApi = inject(BanksApiService);
  private readonly subscriptionsApi = inject(SubscriptionsApiService);
  private readonly session = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notifications = inject(NotificationModalService);

  readonly businessId = this.session.activeBusinessAccountId;
  readonly bankAccounts = signal<BankAccount[]>([]);
  readonly banks = signal<BankPickerEntry[]>([]);
  readonly locations = signal<BusinessLocation[]>([]);
  readonly selectedLocationIds = signal<string[]>([]);
  readonly loading = signal(false);
  readonly creating = signal(false);
  readonly actingId = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly modalOpen = signal(false);
  readonly checkingBankAccountCreation = signal(false);
  readonly bankAccountCreationPermission =
    signal<SubscriptionCreationPermissionResponse | null>(null);
  readonly planAlert = signal('');

  readonly modalTitle = computed(() =>
    this.editingId() ? 'Editar cuenta bancaria' : 'Nueva cuenta bancaria',
  );
  /** Catálogo completo de tipos (coincide con `BankAccountType`). */
  private readonly allAccountTypeOptions: readonly SelectOption[] = [
    { id: 'wallet', label: 'Billetera' },
    { id: 'savings', label: 'Ahorros' },
    { id: 'checking', label: 'Corriente' },
    { id: 'other', label: 'Otro' },
  ];
  readonly currencyOptions: readonly SelectOption[] = [{ id: 'COP', label: 'COP' }];

  readonly canManage = computed(
    () =>
      this.session.activeMembership()?.role === 'account_owner' ||
      this.session.user()?.globalRole === 'account_su',
  );

  readonly canCreateBankAccount = computed(
    () => this.bankAccountCreationPermission()?.allowed !== false,
  );

  readonly bankOptions = computed<SelectOption[]>(() =>
    this.banks().map((bank) => ({
      id: bank.code,
      label: bank.name,
    })),
  );

  readonly form = this.fb.group({
    bankId: ['', [Validators.required, Validators.maxLength(80)]],
    accountNumber: ['', [Validators.required, Validators.maxLength(80)]],
    breBKeys: ['', [Validators.required, Validators.maxLength(800)]],
    displayName: ['', [Validators.maxLength(120)]],
    holderName: ['', [Validators.maxLength(160)]],
    accountType: ['wallet' as BankAccountType],
    currency: ['COP', [Validators.required, Validators.maxLength(3)]],
  });

  /** Banco seleccionado (reactivo) para filtrar los tipos de cuenta. */
  private readonly selectedBankId = toSignal(this.form.controls.bankId.valueChanges, {
    initialValue: this.form.controls.bankId.value,
  });

  /**
   * Tipos de cuenta ofrecidos: si el banco elegido declara
   * `supportedAccountTypes`, solo esos; si no (vacío), todos. Coherente con la
   * validación del backend.
   */
  readonly accountTypeOptions = computed<readonly SelectOption[]>(() => {
    const bank = this.banks().find((b) => b.code === this.selectedBankId());
    const supported = bank?.supportedAccountTypes ?? [];
    if (supported.length === 0) return this.allAccountTypeOptions;
    return this.allAccountTypeOptions.filter((o) =>
      supported.includes(o.id as SupportedAccountType),
    );
  });

  constructor() {
    // Si el tipo elegido deja de ser válido al cambiar de banco, ajústalo al
    // primero disponible para no enviar un tipo que el backend rechazaría.
    effect(() => {
      const options = this.accountTypeOptions();
      const current = this.form.controls.accountType.value;
      if (options.length && !options.some((o) => o.id === current)) {
        this.form.controls.accountType.setValue(options[0].id as BankAccountType);
      }
    });
  }

  ngOnInit(): void {
    this.loadLocations();
    this.loadBanks();
    this.load();
    this.refreshBankAccountCreationPermission();
  }

  loadBanks(): void {
    this.banksApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.banks.set(response.banks),
        error: () => this.banks.set([]),
      });
  }

  /** Nombre del banco a partir de su código (para las tarjetas de la lista). */
  bankName(bankId: string): string {
    return this.banks().find((bank) => bank.code === bankId)?.name ?? bankId;
  }

  load(): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.businessApi
      .listBankAccounts(businessId)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.bankAccounts.set(response.bankAccounts),
        error: (error) => this.error.set(httpErrorMessage(error)),
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

  openCreate(): void {
    this.checkBankAccountCreationPermission(true);
  }

  private openCreateModal(): void {
    this.error.set('');
    this.success.set('');
    this.editingId.set(null);
    this.selectedLocationIds.set([]);
    this.form.reset({
      bankId: '',
      accountNumber: '',
      breBKeys: '',
      displayName: '',
      holderName: '',
      accountType: 'wallet',
      currency: 'COP',
    });
    // Al crear, el número de cuenta es obligatorio.
    this.form.controls.accountNumber.setValidators([Validators.required, Validators.maxLength(80)]);
    this.form.controls.accountNumber.updateValueAndValidity();
    this.modalOpen.set(true);
  }

  openEdit(bankAccount: BankAccount): void {
    this.error.set('');
    this.success.set('');
    this.editingId.set(bankAccount.id);
    this.selectedLocationIds.set([...bankAccount.locationIds]);
    this.form.reset({
      bankId: bankAccount.bankId,
      accountNumber: '',
      breBKeys: bankAccount.breBKeys.join('\n'),
      displayName: bankAccount.displayName ?? '',
      holderName: bankAccount.holderName ?? '',
      accountType: bankAccount.accountType ?? 'wallet',
      currency: bankAccount.currency,
    });
    // Al editar no reingresamos el número (sólo conocemos los últimos 4);
    // se envía sólo si el usuario escribe uno nuevo.
    this.form.controls.accountNumber.setValidators([Validators.maxLength(80)]);
    this.form.controls.accountNumber.updateValueAndValidity();
    this.modalOpen.set(true);
  }

  async closeModal(): Promise<void> {
    if (this.creating()) {
      return;
    }

    if (this.form.dirty) {
      const confirmed = await this.notifications.confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar en la cuenta bancaria.',
        type: 'warning',
        confirmText: 'Descartar',
      });

      if (!confirmed) {
        return;
      }
    }

    this.modalOpen.set(false);
  }

  toggleLocation(locationId: string, checked: boolean): void {
    this.selectedLocationIds.update((ids) =>
      checked ? Array.from(new Set([...ids, locationId])) : ids.filter((id) => id !== locationId),
    );
  }

  save(): void {
    const businessId = this.businessId();
    const locationIds = this.selectedLocationIds();

    if (!businessId) {
      return;
    }

    if (this.form.invalid || locationIds.length === 0) {
      this.form.markAllAsTouched();
      if (locationIds.length === 0) {
        this.error.set('Selecciona al menos una sede para la cuenta.');
      }
      return;
    }

    const editingId = this.editingId();
    if (editingId) {
      this.updateAccount(businessId, editingId, locationIds);
      return;
    }

    const raw = this.form.getRawValue();
    const breBKeys = this.parseBreBKeys(raw.breBKeys);
    if (breBKeys.length === 0) {
      this.form.controls.breBKeys.setErrors({ required: true });
      this.form.controls.breBKeys.markAsTouched();
      this.error.set('Agrega al menos una llave Bre-B.');
      return;
    }
    this.creating.set(true);
    this.error.set('');

    this.businessApi
      .createBankAccount(businessId, {
        bankId: raw.bankId.trim(),
        accountNumber: raw.accountNumber.trim(),
        breBKeys,
        displayName: this.optional(raw.displayName),
        holderName: this.optional(raw.holderName),
        accountType: raw.accountType,
        currency: raw.currency.trim().toUpperCase(),
        locationIds,
      })
      .pipe(
        finalize(() => this.creating.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.bankAccounts.update((accounts) => [response.bankAccount, ...accounts]);
          this.success.set('Cuenta bancaria creada.');
          this.modalOpen.set(false);
          this.refreshBankAccountCreationPermission();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  private updateAccount(businessId: string, bankAccountId: string, locationIds: string[]): void {
    const raw = this.form.getRawValue();
    const accountNumber = raw.accountNumber.trim();
    const breBKeys = this.parseBreBKeys(raw.breBKeys);
    if (breBKeys.length === 0) {
      this.form.controls.breBKeys.setErrors({ required: true });
      this.form.controls.breBKeys.markAsTouched();
      this.error.set('Agrega al menos una llave Bre-B.');
      return;
    }
    this.creating.set(true);
    this.error.set('');

    this.businessApi
      .updateBankAccount(businessId, bankAccountId, {
        bankId: raw.bankId.trim(),
        // Sólo se reenvía el número si el usuario ingresó uno nuevo.
        ...(accountNumber ? { accountNumber } : {}),
        breBKeys,
        displayName: this.optional(raw.displayName),
        holderName: this.optional(raw.holderName),
        accountType: raw.accountType,
        currency: raw.currency.trim().toUpperCase(),
        locationIds,
      })
      .pipe(
        finalize(() => this.creating.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.bankAccounts.update((accounts) =>
            accounts.map((current) =>
              current.id === response.bankAccount.id ? response.bankAccount : current,
            ),
          );
          this.success.set('Cuenta bancaria actualizada.');
          this.modalOpen.set(false);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  activate(bankAccount: BankAccount): void {
    this.updateStatus(bankAccount, true);
  }

  async deactivate(bankAccount: BankAccount): Promise<void> {
    const confirmed = await this.notifications.confirm({
      title: 'Desactivar cuenta bancaria',
      message: 'Esta cuenta dejara de estar disponible para nuevas operaciones.',
      type: 'warning',
      confirmText: 'Desactivar',
    });
    if (!confirmed) {
      return;
    }
    this.updateStatus(bankAccount, false);
  }

  title(bankAccount: BankAccount): string {
    return (
      bankAccount.displayName ||
      `${this.bankName(bankAccount.bankId)} ****${bankAccount.accountNumberLast4}`
    );
  }

  locationNames(bankAccount: BankAccount): string {
    const names = bankAccount.locationIds.map(
      (id) => this.locations().find((location) => location.id === id)?.name ?? id,
    );
    return names.join(', ') || 'Sin sedes';
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  private updateStatus(bankAccount: BankAccount, isActive: boolean): void {
    const businessId = this.businessId();
    if (!businessId) {
      return;
    }

    this.actingId.set(bankAccount.id);
    this.error.set('');
    this.success.set('');

    const request = isActive
      ? this.businessApi.updateBankAccount(businessId, bankAccount.id, { isActive: true })
      : this.businessApi.deactivateBankAccount(businessId, bankAccount.id);

    request
      .pipe(
        finalize(() => this.actingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.bankAccounts.update((accounts) =>
            accounts.map((current) =>
              current.id === response.bankAccount.id ? response.bankAccount : current,
            ),
          );
          this.success.set(isActive ? 'Cuenta activada.' : 'Cuenta desactivada.');
          this.refreshBankAccountCreationPermission();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  private refreshBankAccountCreationPermission(): void {
    this.checkBankAccountCreationPermission(false);
  }

  private checkBankAccountCreationPermission(openWhenAllowed: boolean): void {
    const businessId = this.businessId();
    if (!businessId || this.checkingBankAccountCreation()) {
      return;
    }

    this.checkingBankAccountCreation.set(true);
    this.planAlert.set('');

    this.subscriptionsApi
      .canCreate('bankAccounts', businessId)
      .pipe(
        finalize(() => this.checkingBankAccountCreation.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (permission) => {
          this.bankAccountCreationPermission.set(permission);

          if (permission.allowed) {
            if (openWhenAllowed) {
              this.openCreateModal();
            }
            return;
          }

          this.planAlert.set(this.bankAccountLimitMessage(permission.planName));
        },
        error: (error) => this.planAlert.set(httpErrorMessage(error)),
      });
  }

  private bankAccountLimitMessage(planName: string): string {
    return `Con tu plan actual (${planName}) no puedes agregar mas cuentas bancarias.`;
  }

  private optional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private parseBreBKeys(value: string): string[] {
    return Array.from(
      new Set(
        value
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  }
}
