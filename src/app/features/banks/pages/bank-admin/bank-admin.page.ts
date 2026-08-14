import { DatePipe, JsonPipe, Location } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideArrowLeft,
  LucideInfo,
  LucideLoaderCircle,
  LucidePlus,
} from '@lucide/angular';
import {
  Subject,
  catchError,
  debounceTime,
  filter,
  finalize,
  map,
  of,
  switchMap,
  take,
  timer,
} from 'rxjs';

import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { StatusDot } from '../../../../shared/ui/status-dot/status-dot';
import { Toggle } from '../../../../shared/ui/toggle/toggle';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import type {
  AccountResolutionPolicy,
  AccountResolutionStrategy,
  AdminBank,
  BankChannelConfig,
  BankExample,
  ChannelKey,
  CreateBankRequest,
  ExampleRunResult,
  ExpectedResolution,
  ExpectedValues,
  ParseTestRequest,
  ParseTestResponse,
  ParsedBankNotification,
  RecentEvent,
  SampleMessage,
  SuggestRulesResponse,
  SupportedAccountType,
  UpdateBankRequest,
} from '../../../../shared/models/bank.models';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AdminBanksApiService } from '../../services/admin-banks-api.service';
import { ExampleEditorModal } from '../../components/example-editor-modal/example-editor-modal';

interface ChannelClarity {
  channel: string;
  text: string;
}

/** Estado de preparación del canal móvil de un banco (para el listado). */
interface MobileReadiness {
  key:
    | 'mobile_disabled'
    | 'mobile_origin_only'
    | 'mobile_parses'
    | 'mobile_resolves_account';
  label: string;
  tone: 'muted' | 'warn' | 'info' | 'ok';
}

const CHANNELS: { key: ChannelKey; label: string }[] = [
  { key: 'mobile', label: 'Móvil' },
  { key: 'email', label: 'Correo' },
  { key: 'desk', label: 'Escritorio' },
];

/** Opciones de estrategia de resolución de cuenta (`''` = sin política). */
const RESOLUTION_STRATEGIES: { value: '' | AccountResolutionStrategy; label: string }[] = [
  { value: '', label: 'Sin política — comportamiento por defecto (sufijo o unicidad)' },
  { value: 'single_account_per_notifier', label: 'Una sola cuenta por notificador (Nequi, billeteras)' },
  { value: 'single_account_for_bank', label: 'Una cuenta del banco → resolver por unicidad' },
  { value: 'receiver_account_exact', label: 'Solo por número de cuenta completo' },
  { value: 'receiver_account_suffix', label: 'Por sufijo / últimos dígitos' },
  { value: 'single_or_suffix', label: 'Sufijo si viene; si no, por unicidad' },
  { value: 'required_dynamic_account_match', label: 'Exige coincidencia dinámica (sufijo obligatorio)' },
];

/** Tipos de cuenta soportados por el banco (coinciden con `BankAccountType`). */
const ACCOUNT_TYPES: { key: SupportedAccountType; label: string }[] = [
  { key: 'savings', label: 'Ahorros' },
  { key: 'checking', label: 'Corriente' },
  { key: 'wallet', label: 'Billetera' },
  { key: 'other', label: 'Otro' },
];

/**
 * Panel superadmin del catálogo de bancos. Objetivo 1: control de qué escucha/
 * envía/lee cada notificador (canales móvil/email/desk independientes). Objetivo
 * 2: biblioteca de ejemplos por banco (fixtures vivos) para validar patterns y
 * agregar bancos en caliente.
 */
@Component({
  selector: 'app-bank-admin-page',
  imports: [
    DatePipe,
    JsonPipe,
    ReactiveFormsModule,
    Alert,
    Button,
    Input,
    Modal,
    StatusDot,
    Toggle,
    ExampleEditorModal,
    LucideArrowLeft,
    LucideInfo,
    LucideLoaderCircle,
    LucidePlus,
  ],
  templateUrl: './bank-admin.page.html',
  styleUrl: './bank-admin.page.scss',
})
export class BankAdminPage {
  private readonly api = inject(AdminBanksApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly notifications = inject(NotificationModalService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  readonly channels = CHANNELS;
  readonly resolutionStrategies = RESOLUTION_STRATEGIES;
  readonly accountTypes = ACCOUNT_TYPES;
  // Modales de ayuda (documentación embebida).
  readonly readinessHelpOpen = signal(false);
  readonly policyHelpOpen = signal(false);
  readonly banks = signal<AdminBank[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly actingCode = signal<string | null>(null);
  readonly editingCode = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  // Editor inline (master-detail) abierto con un banco cargado.
  readonly editorOpen = signal(false);
  readonly activeChannel = signal<ChannelKey>('mobile');

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^[a-z0-9][a-z0-9_-]*$/)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    isActive: [true],
    // Tipos de cuenta soportados: propiedad del BANCO (no de un canal).
    supportedAccountTypes: this.fb.group({
      savings: [false],
      checking: [false],
      wallet: [false],
      other: [false],
    }),
    mobile: this.channelGroup(),
    email: this.channelGroup(),
    desk: this.channelGroup(),
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  // --- Probador ---
  readonly testChannel = signal<ChannelKey>('mobile');
  readonly testTitle = signal('');
  readonly testBody = signal('');
  readonly testFrom = signal('');
  readonly testResult = signal<ParseTestResponse | null>(null);
  readonly testing = signal(false);
  readonly testError = signal('');
  private readonly testTrigger = new Subject<void>();

  // --- Biblioteca de ejemplos (banco en edición) ---
  readonly exampleResults = signal<ExampleRunResult[]>([]);
  readonly runningExamples = signal(false);
  readonly recentEvents = signal<RecentEvent[]>([]);
  readonly loadingRecent = signal(false);
  // Subida de archivo .eml/.msg para prellenar el probador con el correo real.
  readonly uploadingEmailFile = signal(false);
  // Prueba de los ejemplos contra las reglas del EDITOR (sin guardar).
  readonly editorTestResults = signal<ExampleRunResult[] | null>(null);
  readonly editorTestChannel = signal<ChannelKey | null>(null);
  readonly testingEditor = signal(false);

  // --- Modal de CRUD de un ejemplo ---
  readonly exampleModalOpen = signal(false);
  // Ejemplo en edición (null = modo crear) + su veredicto guardado.
  readonly exampleModalExample = signal<BankExample | null>(null);
  readonly exampleModalRunResult = signal<ExampleRunResult | null>(null);
  // Semilla para el modo crear (mensaje capturado en el probador).
  readonly exampleModalChannel = signal<ChannelKey>('mobile');
  readonly exampleModalSeed = signal<SampleMessage | null>(null);
  /** Config del canal según el EDITOR (sin guardar), para probar en el modal. */
  readonly exampleConfigProvider = (
    channel: ChannelKey,
  ): Partial<BankChannelConfig> | null => this.buildChannelConfig(channel);

  // --- Navegación de secciones del editor (nav sticky con anchors) ---
  readonly activeSection = signal('sec-base');
  readonly editorSections = computed(() => {
    const sections = [
      { id: 'sec-base', label: 'Datos base' },
      { id: 'sec-canales', label: 'Canales' },
      { id: 'sec-resumen', label: 'Resumen' },
      { id: 'sec-probador', label: 'Probador' },
    ];
    if (this.editingCode()) {
      sections.push({ id: 'sec-ejemplos', label: 'Ejemplos' });
    }
    return sections;
  });

  /** Ejemplos guardados agrupados por canal (para el listado), con conteo ✅. */
  readonly exampleGroups = computed(() => {
    const results = this.exampleResults();
    return CHANNELS.map(({ key, label }) => {
      const items = results.filter((r) => r.example.channel === key);
      return {
        channel: key,
        label,
        items,
        passing: items.filter((r) => r.ok).length,
        total: items.length,
      };
    }).filter((g) => g.total > 0);
  });

  // --- Copiloto de IA (autoría de reglas, on-demand) ---
  readonly suggestingRules = signal(false);
  readonly proposal = signal<SuggestRulesResponse | null>(null);
  readonly proposalChannel = signal<ChannelKey | null>(null);
  readonly suggestError = signal('');

  // --- Editor del prompt del copiloto (global, en caliente) ---
  readonly promptEditorOpen = signal(false);
  readonly promptText = signal('');
  readonly promptDefault = signal('');
  readonly promptIsDefault = signal(true);
  readonly promptLoading = signal(false);
  readonly promptSaving = signal(false);

  private channelGroup() {
    return this.fb.group({
      enabled: [false],
      packageNames: [''],
      contentPatterns: [''],
      displayNames: [''],
      senderPatterns: [''],
      parseRules: [''],
      accountResolutionPolicy: this.fb.group({
        strategy: [''],
        minSuffixDigits: [''],
        requireResolvedAccount: [false],
        maxAccountsPerNotifier: [''],
      }),
    });
  }

  /** Marca los tipos de cuenta del banco (grupo de booleanos) desde una lista. */
  private accountTypesToForm(types?: SupportedAccountType[] | null) {
    const set = new Set(types ?? []);
    return {
      savings: set.has('savings'),
      checking: set.has('checking'),
      wallet: set.has('wallet'),
      other: set.has('other'),
    };
  }

  /** Colecta los tipos de cuenta marcados del form del banco. */
  private buildSupportedAccountTypes(): SupportedAccountType[] {
    const g = this.form.controls.supportedAccountTypes.getRawValue();
    return ACCOUNT_TYPES.filter((t) => g[t.key]).map((t) => t.key);
  }

  channelCtrl(key: ChannelKey): FormGroup {
    return this.form.controls[key];
  }

  channelEnabled(key: ChannelKey): boolean {
    return Boolean(this.form.controls[key].controls.enabled.value);
  }

  setChannelEnabled(key: ChannelKey, value: boolean): void {
    this.form.controls[key].controls.enabled.setValue(value);
    this.form.controls[key].markAsDirty();
  }

  setActive(value: boolean): void {
    this.form.controls.isActive.setValue(value);
    this.form.controls.isActive.markAsDirty();
  }

  readonly clarity = computed<ChannelClarity[]>(() => {
    this.formValue();
    return CHANNELS.map(({ key, label }) => ({
      channel: label,
      text: this.describeChannel(key, label),
    }));
  });

  constructor() {
    this.load();

    this.testTrigger
      .pipe(
        debounceTime(400),
        switchMap(() => {
          const request = this.buildTestRequest();
          if (!request) {
            this.testing.set(false);
            return of(null);
          }
          this.testing.set(true);
          return this.api.testParse(request).pipe(
            catchError((err) => {
              this.testError.set(httpErrorMessage(err));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.testing.set(false);
        if (result) {
          this.testResult.set(result);
          this.testError.set('');
        }
      });
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
        error: (err) => this.error.set(httpErrorMessage(err)),
      });
  }

  // --- Modal abrir/cerrar -------------------------------------------------

  private emptyChannelForm() {
    return {
      enabled: false,
      packageNames: '',
      contentPatterns: '',
      displayNames: '',
      senderPatterns: '',
      parseRules: '',
      accountResolutionPolicy: {
        strategy: '',
        minSuffixDigits: '',
        requireResolvedAccount: false,
        maxAccountsPerNotifier: '',
      },
    };
  }

  private channelToForm(cfg: BankChannelConfig) {
    const policy = cfg.accountResolutionPolicy ?? null;
    return {
      enabled: cfg.enabled,
      packageNames: (cfg.packageNames ?? []).join('\n'),
      contentPatterns: (cfg.contentPatterns ?? []).join('\n'),
      displayNames: (cfg.displayNames ?? []).join('\n'),
      senderPatterns: (cfg.senderPatterns ?? []).join('\n'),
      parseRules: cfg.parseRules ? JSON.stringify(cfg.parseRules, null, 2) : '',
      accountResolutionPolicy: {
        strategy: policy?.strategy ?? '',
        minSuffixDigits:
          policy?.minSuffixDigits != null ? String(policy.minSuffixDigits) : '',
        requireResolvedAccount: policy?.requireResolvedAccount ?? false,
        maxAccountsPerNotifier:
          policy?.maxAccountsPerNotifier != null
            ? String(policy.maxAccountsPerNotifier)
            : '',
      },
    };
  }

  async openCreate(): Promise<void> {
    if (this.saving()) return;
    if (!(await this.confirmDiscardIfDirty())) return;
    this.error.set('');
    this.success.set('');
    this.editingCode.set(null);
    this.exampleResults.set([]);
    this.proposal.set(null);
    this.proposalChannel.set(null);
    this.form.reset({
      code: '',
      name: '',
      isActive: true,
      supportedAccountTypes: this.accountTypesToForm([]),
      mobile: this.emptyChannelForm(),
      email: this.emptyChannelForm(),
      desk: this.emptyChannelForm(),
    });
    this.form.controls.code.enable();
    this.activeChannel.set('mobile');
    this.activeSection.set('sec-base');
    this.resetTester();
    this.editorOpen.set(true);
  }

  openEdit(bank: AdminBank): void {
    this.error.set('');
    this.success.set('');
    this.editingCode.set(bank.code);
    this.form.reset({
      code: bank.code,
      name: bank.name,
      isActive: bank.isActive,
      supportedAccountTypes: this.accountTypesToForm(bank.supportedAccountTypes),
      mobile: this.channelToForm(bank.mobile),
      email: this.channelToForm(bank.email),
      desk: this.channelToForm(bank.desk),
    });
    this.form.controls.code.disable();
    this.activeChannel.set('mobile');
    this.activeSection.set('sec-base');
    this.resetTester();
    this.exampleResults.set([]);
    this.proposal.set(null);
    this.proposalChannel.set(null);
    this.editorOpen.set(true);
    this.runExamples();
  }

  /** Confirma descartar si hay cambios sin guardar. `true` = seguir adelante. */
  private async confirmDiscardIfDirty(): Promise<boolean> {
    if (!this.form.dirty) return true;
    return this.notifications.confirm({
      title: 'Descartar cambios',
      message: 'Tienes cambios sin guardar en este banco.',
      type: 'warning',
      confirmText: 'Descartar',
    });
  }

  async closeEditor(): Promise<void> {
    if (this.saving()) return;
    if (!(await this.confirmDiscardIfDirty())) return;
    this.editorOpen.set(false);
    this.editingCode.set(null);
  }

  /** Vuelve a la página anterior; si no hay historial, al listado de negocios. */
  goBack(): void {
    if (history.length > 1) this.location.back();
    else void this.router.navigate(['/businesses']);
  }

  /** Selecciona un banco del menú lateral para editarlo (con guardado seguro). */
  async selectBank(bank: AdminBank): Promise<void> {
    if (this.saving()) return;
    if (this.editingCode() === bank.code && this.editorOpen()) return;
    if (!(await this.confirmDiscardIfDirty())) return;
    this.openEdit(bank);
  }

  /** ¿El banco en edición está activo? (para mostrar "Desactivar"). */
  currentBankActive(): boolean {
    const code = this.editingCode();
    return code
      ? (this.banks().find((b) => b.code === code)?.isActive ?? false)
      : false;
  }

  /** Desactiva el banco que se está editando (reusa `remove`). */
  removeCurrent(): void {
    const code = this.editingCode();
    const bank = code ? this.banks().find((b) => b.code === code) : undefined;
    if (bank) void this.remove(bank);
  }

  // --- Guardar ------------------------------------------------------------

  /** Construye la config de un canal desde su FormGroup; null si el JSON es inválido. */
  private buildChannelConfig(key: ChannelKey): Partial<BankChannelConfig> | null {
    const g = this.form.controls[key].getRawValue();
    const rules = this.parseRulesJson(g.parseRules);
    if (rules === null) return null;
    return {
      enabled: g.enabled,
      packageNames: this.toList(g.packageNames),
      contentPatterns: this.toList(g.contentPatterns),
      displayNames: this.toList(g.displayNames),
      senderPatterns: this.toList(g.senderPatterns),
      parseRules: rules ?? null,
      accountResolutionPolicy: this.buildResolutionPolicy(
        g.accountResolutionPolicy,
      ),
    };
  }

  /** Arma la política; null si no se eligió estrategia (= sin política). */
  private buildResolutionPolicy(g: {
    strategy: string;
    minSuffixDigits: string;
    requireResolvedAccount: boolean;
    maxAccountsPerNotifier: string;
  }): BankChannelConfig['accountResolutionPolicy'] {
    if (!g.strategy) return null;
    const policy: AccountResolutionPolicy = {
      strategy: g.strategy as AccountResolutionStrategy,
    };
    const minSuffix = Number.parseInt(g.minSuffixDigits, 10);
    if (Number.isFinite(minSuffix)) policy.minSuffixDigits = minSuffix;
    if (g.requireResolvedAccount) policy.requireResolvedAccount = true;
    const maxAccounts = Number.parseInt(g.maxAccountsPerNotifier, 10);
    if (Number.isFinite(maxAccounts)) policy.maxAccountsPerNotifier = maxAccounts;
    return policy;
  }

  save(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const mobile = this.buildChannelConfig('mobile');
    const email = this.buildChannelConfig('email');
    const desk = this.buildChannelConfig('desk');
    if (!mobile || !email || !desk) {
      this.error.set('El JSON de reglas de extracción es inválido. Revisa el editor.');
      return;
    }

    const v = this.form.getRawValue();
    const supportedAccountTypes = this.buildSupportedAccountTypes();
    const editingCode = this.editingCode();
    this.saving.set(true);
    this.error.set('');

    const request$ = editingCode
      ? this.api.update(editingCode, {
          name: v.name.trim(),
          isActive: v.isActive,
          supportedAccountTypes,
          mobile,
          email,
          desk,
        } satisfies UpdateBankRequest)
      : this.api.create({
          code: v.code.trim().toLowerCase(),
          name: v.name.trim(),
          isActive: v.isActive,
          supportedAccountTypes,
          mobile,
          email,
          desk,
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
          // Master-detail: el editor sigue abierto mostrando el banco guardado.
          // Fija el código (para create) y marca el form limpio para no disparar
          // el aviso de "cambios sin guardar" al navegar a otro banco.
          this.editingCode.set(bank.code);
          this.form.controls.code.disable();
          this.form.markAsPristine();
          if (editingCode) this.runExamples();
        },
        error: (err) => this.error.set(httpErrorMessage(err)),
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
        error: (err) => this.error.set(httpErrorMessage(err)),
      });
  }

  /**
   * Aplica un arreglo sugerido por el diagnóstico (agregar el patrón faltante al
   * FormControl del canal). NO guarda: el operador revisa y usa "Guardar cambios".
   */
  applyFix(fix: NonNullable<ExampleRunResult['diagnosis']>['fix']): void {
    if (!fix) return;
    const ctrl = this.form.controls[fix.channel].controls[fix.field];
    const current = (ctrl.value ?? '').trim();
    const lines = current ? current.split(/[\n,]/).map((v) => v.trim()) : [];
    if (lines.some((l) => l.toLowerCase() === fix.value.toLowerCase())) {
      this.success.set(`«${fix.value}» ya estaba en la config.`);
      return;
    }
    ctrl.setValue([...lines, fix.value].filter(Boolean).join('\n'));
    ctrl.markAsDirty();
    this.activeChannel.set(fix.channel);
    this.success.set(
      `Agregado «${fix.value}». Revisa el canal ${fix.channel} y usa "Guardar cambios"; luego se revalidan los ejemplos.`,
    );
    // Lleva al operador a VER dónde quedó el patrón agregado.
    this.scrollToSection('sec-canales');
  }

  /** Desplaza el editor a una sección (nav sticky y saltos automáticos). */
  scrollToSection(id: string): void {
    this.activeSection.set(id);
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --- Probador -----------------------------------------------------------

  private resetTester(): void {
    this.testChannel.set('mobile');
    this.testTitle.set('');
    this.testBody.set('');
    this.testFrom.set('');
    this.testResult.set(null);
    this.testError.set('');
    this.testing.set(false);
    this.recentEvents.set([]);
    this.suggestError.set('');
    this.editorTestResults.set(null);
    this.editorTestChannel.set(null);
  }

  setTestChannel(channel: ChannelKey): void {
    this.testChannel.set(channel);
    this.recentEvents.set([]);
    this.testTrigger.next();
  }

  onTestTitle(value: string): void {
    this.testTitle.set(value);
    this.testTrigger.next();
  }

  onTestBody(value: string): void {
    this.testBody.set(value);
    this.testTrigger.next();
  }

  onTestFrom(value: string): void {
    this.testFrom.set(value);
    this.testTrigger.next();
  }

  private buildTestRequest(): ParseTestRequest | null {
    const channel = this.testChannel();
    const config = this.buildChannelConfig(channel);
    if (!config) {
      this.testError.set('El JSON de reglas de extracción es inválido.');
      return null;
    }
    const sample =
      channel === 'email'
        ? {
            subject: this.testTitle(),
            bodyText: this.testBody(),
            from: this.testFrom(),
          }
        : { title: this.testTitle(), text: this.testBody() };
    return { channel, sample, config };
  }

  // --- Biblioteca de ejemplos --------------------------------------------

  runExamples(): void {
    const code = this.editingCode();
    if (!code) return;
    this.runningExamples.set(true);
    this.api
      .runExamples(code)
      .pipe(
        finalize(() => this.runningExamples.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (results) => this.exampleResults.set(results),
        error: () => this.exampleResults.set([]),
      });
  }

  // --- Modal de CRUD de un ejemplo -----------------------------------------

  /** Abre el modal con el ejemplo de una card (ver/editar/borrar). */
  openExample(result: ExampleRunResult): void {
    const bank = this.banks().find((b) => b.code === this.editingCode());
    const example = bank?.examples.find((e) => e.id === result.example.id);
    if (!example) return;
    this.exampleModalExample.set(example);
    this.exampleModalRunResult.set(result);
    this.exampleModalSeed.set(null);
    this.exampleModalChannel.set(example.channel);
    this.exampleModalOpen.set(true);
  }

  /** Abre el modal vacío en modo crear (canal = tab activa). */
  openNewExample(): void {
    this.exampleModalExample.set(null);
    this.exampleModalRunResult.set(null);
    this.exampleModalSeed.set(null);
    this.exampleModalChannel.set(this.activeChannel());
    this.exampleModalOpen.set(true);
  }

  /** Abre el modal en modo crear, prellenado con el mensaje del probador. */
  openExampleFromTester(): void {
    const seed: SampleMessage =
      this.testChannel() === 'email'
        ? {
            subject: this.testTitle(),
            bodyText: this.testBody(),
            from: this.testFrom(),
          }
        : { title: this.testTitle(), text: this.testBody() };
    this.exampleModalExample.set(null);
    this.exampleModalRunResult.set(null);
    this.exampleModalSeed.set(seed);
    this.exampleModalChannel.set(this.testChannel());
    this.exampleModalOpen.set(true);
  }

  /** El modal guardó (POST/PATCH): refresca el banco SIN tocar el form sucio. */
  onExampleSaved(bank: AdminBank): void {
    this.banks.update((banks) =>
      banks.map((b) => (b.code === bank.code ? bank : b)),
    );
    this.success.set(
      this.exampleModalExample() ? 'Ejemplo actualizado.' : 'Ejemplo agregado.',
    );
    this.closeExampleModal();
    this.runExamples();
  }

  /** El modal borró el ejemplo (con confirmación). */
  onExampleDeleted(bank: AdminBank): void {
    this.banks.update((banks) =>
      banks.map((b) => (b.code === bank.code ? bank : b)),
    );
    this.success.set('Ejemplo eliminado.');
    this.closeExampleModal();
    this.runExamples();
  }

  closeExampleModal(): void {
    this.exampleModalOpen.set(false);
    this.exampleModalExample.set(null);
    this.exampleModalRunResult.set(null);
    this.exampleModalSeed.set(null);
  }

  /**
   * Corre los ejemplos del canal activo contra las reglas ACTUALES del editor (sin
   * guardar), para verificar la propuesta de la IA o ediciones manuales antes de
   * "Guardar cambios". Reusa la misma verificación ✅/❌ + diagnóstico del backend.
   */
  testExamplesAgainstEditor(): void {
    const code = this.editingCode();
    if (!code) return;
    const channel = this.activeChannel();
    const config = this.buildChannelConfig(channel);
    if (!config) {
      this.error.set('El JSON de reglas de extracción es inválido. Revisa el editor.');
      return;
    }
    this.testingEditor.set(true);
    this.editorTestChannel.set(channel);
    this.error.set('');
    this.api
      .testExamples(code, channel, config)
      .pipe(
        finalize(() => this.testingEditor.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (results) => this.editorTestResults.set(results),
        error: (err) => {
          this.editorTestResults.set(null);
          this.error.set(httpErrorMessage(err));
        },
      });
  }

  clearEditorTest(): void {
    this.editorTestResults.set(null);
    this.editorTestChannel.set(null);
  }

  hasFailures(results: ExampleRunResult[]): boolean {
    return results.some((r) => !r.ok);
  }

  // --- Editor del prompt del copiloto ------------------------------------

  /** Abre el editor y carga la plantilla actual del prompt (global). */
  togglePromptEditor(): void {
    if (this.promptEditorOpen()) {
      this.promptEditorOpen.set(false);
      return;
    }
    this.promptEditorOpen.set(true);
    this.promptLoading.set(true);
    this.api
      .getCopilotPrompt()
      .pipe(
        finalize(() => this.promptLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (res) => {
          this.promptText.set(res.prompt);
          this.promptDefault.set(res.default);
          this.promptIsDefault.set(res.isDefault);
        },
        error: (err) => this.error.set(httpErrorMessage(err)),
      });
  }

  savePrompt(): void {
    this.promptSaving.set(true);
    this.error.set('');
    this.api
      .saveCopilotPrompt(this.promptText())
      .pipe(
        finalize(() => this.promptSaving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (res) => {
          this.promptIsDefault.set(res.isDefault);
          this.success.set(
            res.isDefault
              ? 'Prompt restaurado al valor por defecto.'
              : 'Prompt del copiloto guardado. Aplica a las próximas generaciones.',
          );
          this.promptEditorOpen.set(false);
        },
        error: (err) => this.error.set(httpErrorMessage(err)),
      });
  }

  /** Rellena el editor con el default (no guarda hasta "Guardar prompt"). */
  resetPromptToDefault(): void {
    this.promptText.set(this.promptDefault());
  }

  // --- Copiloto de IA -----------------------------------------------------

  /**
   * Pide a la IA que proponga/reparen los `parseRules` del canal usando los
   * ejemplos guardados. El backend valida (RE2) y corre todos los ejemplos; aquí
   * solo se MUESTRA la propuesta + el reporte. Se aplica con `acceptProposal()`.
   */
  suggestRules(channel: ChannelKey): void {
    const code = this.editingCode();
    if (!code) {
      this.suggestError.set('Guarda el banco antes de generar reglas con IA.');
      return;
    }
    this.suggestingRules.set(true);
    this.proposalChannel.set(channel);
    this.proposal.set(null);
    this.suggestError.set('');
    this.api
      .suggestRules(code, channel)
      .pipe(
        switchMap(({ jobId }) =>
          timer(0, 2500).pipe(
            switchMap(() => this.api.suggestRulesJob(code, jobId)),
            map((job) => {
              if (job.status === 'error') {
                throw new Error(job.error ?? 'No se pudo generar el parser.');
              }
              if (job.status === 'done' && !job.result) {
                throw new Error('La generación terminó sin devolver reglas.');
              }
              return job.status === 'done' ? job.result : null;
            }),
            filter((result): result is SuggestRulesResponse => result !== null),
            take(1),
          ),
        ),
        finalize(() => this.suggestingRules.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.proposal.set(response);
          this.loadProposalIntoEditor(response, channel);
          this.success.set(
            response.allPass
              ? 'Parser generado y cargado en el editor. Usa "Guardar cambios" para aplicarlo.'
              : 'Parser generado y cargado en el editor, pero algunos ejemplos fallan. Revísalo antes de guardar.',
          );
        },
        error: (err) => {
          this.proposalChannel.set(null);
          this.suggestError.set(err instanceof Error ? err.message : httpErrorMessage(err));
        },
      });
  }

  /** Vuelca la propuesta al editor JSON del canal (el operador guarda luego). */
  acceptProposal(): void {
    const proposal = this.proposal();
    const channel = this.proposalChannel();
    if (!proposal || !channel) return;
    // Solo se acepta una propuesta que pase TODOS los ejemplos.
    if (!proposal.allPass) {
      this.suggestError.set(
        'La propuesta aún no pasa todos los ejemplos. Genera de nuevo o revisa los ejemplos que fallan.',
      );
      return;
    }
    this.loadProposalIntoEditor(proposal, channel);
    this.activeChannel.set(channel);
    this.proposal.set(null);
    this.proposalChannel.set(null);
    this.success.set(
      'Reglas propuestas cargadas en el editor. Revisa y usa "Guardar cambios" para aplicarlas.',
    );
  }

  private loadProposalIntoEditor(proposal: SuggestRulesResponse, channel: ChannelKey): void {
    const ctrl = this.form.controls[channel].controls.parseRules;
    ctrl.setValue(JSON.stringify(proposal.proposedRules, null, 2));
    ctrl.markAsDirty();
    this.activeChannel.set(channel);
  }

  dismissProposal(): void {
    this.proposal.set(null);
    this.proposalChannel.set(null);
  }

  /** Etiqueta legible de un resultado de resolución (`account`/`ambiguous`/`unresolved`). */
  resolutionOutcomeLabel(outcome: ExpectedResolution): string {
    return outcome === 'account'
      ? 'resuelve a cuenta'
      : outcome === 'ambiguous'
        ? 'ambiguo'
        : 'sin resolver';
  }

  /** Etiqueta de lo esperado en resolución (para el ❌ del reporte). */
  resolutionExpectedLabel(res: ExampleRunResult['resolution']): string {
    if (!res?.expected) return '';
    return res.expected === 'account'
      ? `cuenta ${res.expectedAccount ?? ''}`.trim()
      : this.resolutionOutcomeLabel(res.expected);
  }

  /** Resumen legible del `expected` de un ejemplo (para la lista y el reporte). */
  expectedSummary(expected?: ExpectedValues | null): string {
    if (!expected) return '';
    return Object.entries(expected)
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
  }

  /** Muestra la fecha que declaró el banco en el mensaje (o el fallback resuelto). */
  formatTransferDate(value: ParsedBankNotification['transactionDate']): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (n: number) => String(n).padStart(2, '0');
    return [
      `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
      `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    ].join(' ');
  }

  /** Carga eventos reales recientes del banco para capturarlos como ejemplo. */
  loadRecentEvents(): void {
    const code = this.editingCode();
    if (!code) return;
    this.loadingRecent.set(true);
    this.api
      .recentEvents(code, this.testChannel())
      .pipe(
        finalize(() => this.loadingRecent.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (events) => this.recentEvents.set(events),
        error: (err) => this.error.set(httpErrorMessage(err)),
      });
  }

  pickRecent(ev: RecentEvent): void {
    const s = ev.sample;
    if (this.testChannel() === 'email') {
      this.testTitle.set(s.subject ?? '');
      this.testBody.set(s.bodyText ?? '');
      this.testFrom.set(s.from ?? '');
    } else {
      this.testTitle.set(s.title ?? '');
      this.testBody.set([s.text, s.bigText].filter(Boolean).join('\n'));
    }
    this.recentEvents.set([]);
    this.testTrigger.next();
  }

  /**
   * Sube un archivo de correo (.eml/.msg), lo parsea en el backend al texto plano
   * real y prellena el probador (canal correo) para crear un ejemplo fiel.
   */
  onEmailFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite re-subir el mismo archivo
    if (!file) return;
    this.uploadingEmailFile.set(true);
    this.suggestError.set('');
    this.api
      .parseEmailFile(file)
      .pipe(
        finalize(() => this.uploadingEmailFile.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ sample }) => {
          this.testChannel.set('email');
          this.testTitle.set(sample.subject ?? '');
          // Cuerpo: texto plano si viene; si no (p. ej. .msg/correo solo-HTML),
          // cae al HTML crudo — que es justo lo que el parser corre en ese caso.
          this.testBody.set(sample.bodyText || sample.bodyHtml || '');
          this.testFrom.set(sample.from ?? '');
          if (!sample.bodyText && !sample.bodyHtml) {
            this.suggestError.set(
              'El archivo no traía cuerpo legible (asunto/remitente sí). Prueba con el correo reenviado (suele traer texto plano).',
            );
          }
          this.testTrigger.next();
        },
        error: (err) => this.suggestError.set(httpErrorMessage(err)),
      });
  }

  // --- Utilidades ---------------------------------------------------------

  isInvalid(controlName: 'code' | 'name'): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }


  /**
   * Estado de preparación del canal móvil (ver estrategia, capa 4): desde
   * "deshabilitado" hasta "resuelve cuenta" (listo para producción). Heurística
   * sobre la config guardada del banco.
   */
  mobileReadiness(bank: AdminBank): MobileReadiness {
    const m = bank.mobile;
    if (!m?.enabled) {
      return { key: 'mobile_disabled', label: 'Móvil off', tone: 'muted' };
    }
    const hasParse = Boolean(
      m.parseRules && Object.keys(m.parseRules).length > 0,
    );
    const hasPolicy = Boolean(m.accountResolutionPolicy?.strategy);
    if (hasParse && hasPolicy) {
      return { key: 'mobile_resolves_account', label: 'Resuelve cuenta', tone: 'ok' };
    }
    if (hasParse) {
      return { key: 'mobile_parses', label: 'Extrae datos', tone: 'info' };
    }
    return { key: 'mobile_origin_only', label: 'Solo origen', tone: 'warn' };
  }

  parseRulesInvalid(channel: ChannelKey): boolean {
    return this.parseRulesJson(this.form.controls[channel].controls.parseRules.value) === null;
  }

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

  private parseRulesJson(raw: string): Record<string, unknown> | undefined | null {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return undefined;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  private describeChannel(key: ChannelKey, label: string): string {
    const g = this.form.controls[key].getRawValue();
    if (!g.enabled) return `${label}: desactivado — no se escucha nada por este canal.`;
    const pkgs = this.toList(g.packageNames);
    const contents = this.toList(g.contentPatterns);
    const senders = this.toList(g.senderPatterns);

    if (key === 'email') {
      const parts: string[] = [];
      if (senders.length) parts.push(`remitentes: ${senders.join(', ')}`);
      if (contents.length) parts.push(`contenido: ${contents.join(', ')}`);
      return parts.length
        ? `Correo: atribuye correos por ${parts.join('; ')}.`
        : 'Correo: habilitado, sin remitentes ni contenido — no atribuirá nada.';
    }

    if (pkgs.length === 0 && senders.length === 0) {
      return `${label}: habilitado pero sin apps ni remitentes — no se escuchará nada.`;
    }
    let text = contents.length
      ? `${label}: escuchará ${pkgs.join(', ') || 'las apps configuradas'} y enviará solo los que contengan: ${contents.join(', ')}.`
      : `${label}: enviará todo de ${pkgs.join(', ') || 'las apps configuradas'}.`;
    if (senders.length) {
      text += ` Solo de remitentes (título): ${senders.join(', ')}.`;
    }
    return text;
  }
}
