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
import { Subject, catchError, debounceTime, finalize, of, switchMap } from 'rxjs';

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
  ParseTestRequest,
  ParseTestResponse,
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
    phoneTitlePatterns: [''],
    phoneDisplayNames: [''],
    phoneParseRules: [''],
    emailEnabled: [false],
    emailPackageNames: [''],
    emailContentPatterns: [''],
    emailSenderPatterns: [''],
    emailDisplayNames: [''],
    emailParseRules: [''],
  });

  // --- Probador (Fase 2) ---
  readonly testChannel = signal<'phone' | 'email'>('phone');
  readonly testTitle = signal('');
  readonly testBody = signal('');
  readonly testResult = signal<ParseTestResponse | null>(null);
  readonly testing = signal(false);
  readonly testError = signal('');
  readonly loadingDefaults = signal(false);
  private readonly testTrigger = new Subject<void>();

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
          v.phoneTitlePatterns ?? '',
          'título',
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
          v.emailSenderPatterns ?? '',
          'remitente',
        ),
      },
    ];
  });

  constructor() {
    this.load();

    // Probador con debounce: cada cambio en el mensaje/canal/config re-consulta
    // al backend qué extraería la config actual (RE2 real), sin guardar.
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
            catchError((error) => {
              this.testError.set(httpErrorMessage(error));
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

  private resetTester(): void {
    this.testTitle.set('');
    this.testBody.set('');
    this.testResult.set(null);
    this.testError.set('');
    this.testing.set(false);
  }

  setTestChannel(channel: 'phone' | 'email'): void {
    this.testChannel.set(channel);
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

  /** Carga las reglas por defecto del banco (si existen) en el canal indicado. */
  loadDefaults(channel: 'phone' | 'email'): void {
    const code = (this.editingCode() ?? this.form.controls.code.value)
      ?.trim()
      .toLowerCase();
    if (!code) return;
    this.loadingDefaults.set(true);
    this.api
      .defaultRules(code)
      .pipe(
        finalize(() => this.loadingDefaults.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          const rules = channel === 'phone' ? response.phone : response.email;
          const control =
            channel === 'phone'
              ? this.form.controls.phoneParseRules
              : this.form.controls.emailParseRules;
          if (rules) {
            control.setValue(JSON.stringify(rules, null, 2));
            control.markAsDirty();
          } else {
            this.error.set('Este banco no tiene reglas por defecto.');
          }
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  /** Parsea el JSON de reglas; '' → undefined; inválido → null (marca error). */
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

  /** ¿El JSON de reglas de un canal es inválido? (para el hint del editor). */
  parseRulesInvalid(channel: 'phone' | 'email'): boolean {
    const raw =
      channel === 'phone'
        ? this.form.controls.phoneParseRules.value
        : this.form.controls.emailParseRules.value;
    return this.parseRulesJson(raw) === null;
  }

  private buildTestRequest(): ParseTestRequest | null {
    const v = this.form.getRawValue();
    const channel = this.testChannel();
    const rawRules =
      channel === 'phone' ? v.phoneParseRules : v.emailParseRules;
    const parseRules = this.parseRulesJson(rawRules);
    if (parseRules === null) {
      this.testError.set('El JSON de reglas de extracción es inválido.');
      return null;
    }
    const config =
      channel === 'phone'
        ? {
            enabled: v.phoneEnabled,
            packageNames: this.toList(v.phonePackageNames),
            contentPatterns: this.toList(v.phoneContentPatterns),
            titlePatterns: this.toList(v.phoneTitlePatterns),
            parseRules,
          }
        : {
            enabled: v.emailEnabled,
            contentPatterns: this.toList(v.emailContentPatterns),
            senderPatterns: this.toList(v.emailSenderPatterns),
            parseRules,
          };
    const sample =
      channel === 'phone'
        ? { title: this.testTitle(), text: this.testBody() }
        : { subject: this.testTitle(), bodyText: this.testBody() };
    return { channel, sample, config };
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
      phoneTitlePatterns: '',
      phoneDisplayNames: '',
      phoneParseRules: '',
      emailEnabled: false,
      emailPackageNames: '',
      emailContentPatterns: '',
      emailSenderPatterns: '',
      emailDisplayNames: '',
      emailParseRules: '',
    });
    this.form.controls.code.enable();
    this.resetTester();
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
      phoneTitlePatterns: (bank.phone.titlePatterns ?? []).join('\n'),
      phoneDisplayNames: bank.phone.displayNames.join('\n'),
      phoneParseRules: bank.phone.parseRules
        ? JSON.stringify(bank.phone.parseRules, null, 2)
        : '',
      emailEnabled: bank.email.enabled,
      emailPackageNames: bank.email.packageNames.join('\n'),
      emailContentPatterns: bank.email.contentPatterns.join('\n'),
      emailSenderPatterns: (bank.email.senderPatterns ?? []).join('\n'),
      emailDisplayNames: bank.email.displayNames.join('\n'),
      emailParseRules: bank.email.parseRules
        ? JSON.stringify(bank.email.parseRules, null, 2)
        : '',
    });
    // `code` es inmutable: la clave de referencia de las cuentas bancarias.
    this.form.controls.code.disable();
    this.resetTester();
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

    const phoneRules = this.parseRulesJson(v.phoneParseRules);
    const emailRules = this.parseRulesJson(v.emailParseRules);
    if (phoneRules === null || emailRules === null) {
      this.error.set(
        'El JSON de reglas de extracción es inválido. Revisa el editor del parser.',
      );
      return;
    }

    this.saving.set(true);
    this.error.set('');

    const phone = {
      enabled: v.phoneEnabled,
      packageNames: this.toList(v.phonePackageNames),
      contentPatterns: this.toList(v.phoneContentPatterns),
      titlePatterns: this.toList(v.phoneTitlePatterns),
      displayNames: this.toList(v.phoneDisplayNames),
      // null limpia las reglas (vuelve al fallback por defecto del banco).
      parseRules: phoneRules ?? null,
    };
    const email = {
      enabled: v.emailEnabled,
      packageNames: this.toList(v.emailPackageNames),
      contentPatterns: this.toList(v.emailContentPatterns),
      senderPatterns: this.toList(v.emailSenderPatterns),
      displayNames: this.toList(v.emailDisplayNames),
      parseRules: emailRules ?? null,
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
    senderRaw: string,
    senderLabel: 'título' | 'remitente',
  ): string {
    if (!enabled) return `${name}: desactivado — no se escucha nada por este canal.`;
    const pkgs = this.toList(pkgRaw);
    const senders = this.toList(senderRaw);
    if (pkgs.length === 0 && senders.length === 0) {
      return `${name}: habilitado pero sin apps ni ${senderLabel}s configurados — no se escuchará nada.`;
    }
    const pats = this.toList(patRaw);
    let text = pats.length
      ? `${name}: escuchará ${pkgs.join(', ') || 'los mensajes'} y enviará solo los que contengan alguno de: ${pats.join(', ')}; el resto se ignora.`
      : `${name}: enviará todas las notificaciones de ${pkgs.join(', ') || 'las apps configuradas'}; sin filtro por contenido.`;
    if (senders.length) {
      text += ` Atribuirá por ${senderLabel} cuando contenga: ${senders.join(', ')}.`;
    }
    const disps = this.toList(dispRaw);
    if (disps.length) {
      text += ` En escritorio (Vínculo con Windows) también se identifica por: ${disps.join(', ')}.`;
    }
    return text;
  }
}
