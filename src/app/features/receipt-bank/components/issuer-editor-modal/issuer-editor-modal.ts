import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import type { ReceiptIssuer } from '../../../../shared/models/receipt-bank.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { Select, type SelectOption } from '../../../../shared/ui/select/select';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { BanksApiService } from '../../../banks/services/banks-api.service';
import { ReceiptBankApiService } from '../../services/receipt-bank-api.service';
import { RECEIPT_CODE_PATTERN, linesToList } from '../../utils/receipt-bank.util';

export interface IssuerDraft {
  issuer: ReceiptIssuer | null;
  /** Valores iniciales de un emisor nuevo. */
  code?: string;
  name?: string;
}

/** Crear o editar un banco emisor: el banco desde el que se hizo la transferencia. */
@Component({
  selector: 'app-issuer-editor-modal',
  imports: [FormsModule, Alert, Button, Input, Modal, Select],
  template: `
    <yep-modal
      [open]="draft() !== null"
      [title]="isEditing() ? 'Editar banco emisor' : 'Agregar banco emisor'"
      subtitle="Es el banco desde el que se hizo la transferencia, no el banco donde la recibe el negocio."
      [loading]="saving()"
      (closeRequested)="closed.emit()"
    >
      <div class="issuer-form">
        <yep-input
          label="Nombre"
          placeholder="Ej. Nequi"
          [required]="true"
          [ngModel]="name()"
          (ngModelChange)="name.set($event)"
        />
        <yep-input
          label="Código"
          placeholder="Ej. nequi"
          hint="En minúsculas y sin espacios. No se puede cambiar después."
          [required]="true"
          [disabled]="isEditing()"
          [error]="codeError()"
          [ngModel]="code()"
          (ngModelChange)="code.set($event)"
        />
        <yep-select
          label="Banco del catálogo (opcional)"
          placeholder="Sin vincular"
          hint="Sirve para cruzar el comprobante con las cuentas del negocio. El emisor no se agrega a Gestión de bancos."
          [options]="bankOptions()"
          [clearable]="true"
          [searchable]="true"
          [ngModel]="bankCode()"
          (ngModelChange)="bankCode.set($event ?? '')"
        />
        <label class="issuer-form__field">
          <span>Textos que lo nombran (uno por línea)</span>
          <textarea
            rows="3"
            [value]="aliases()"
            (input)="aliases.set($any($event.target).value)"
          ></textarea>
        </label>
        <label class="issuer-form__field">
          <span>Notas</span>
          <textarea
            rows="2"
            maxlength="500"
            [value]="notes()"
            (input)="notes.set($any($event.target).value)"
          ></textarea>
        </label>
        @if (error()) {
          <yep-alert variant="error">{{ error() }}</yep-alert>
        }
      </div>
      <ng-container modalFooter>
        <yep-button variant="ghost" [disabled]="saving()" (clicked)="closed.emit()">Cancelar</yep-button>
        <yep-button [loading]="saving()" [disabled]="!canSave()" (clicked)="save()">Guardar</yep-button>
      </ng-container>
    </yep-modal>
  `,
  styleUrl: './issuer-editor-modal.scss',
})
export class IssuerEditorModal {
  private readonly api = inject(ReceiptBankApiService);
  private readonly banksApi = inject(BanksApiService);
  private readonly destroyRef = inject(DestroyRef);

  /** `null` = cerrado. */
  readonly draft = input<IssuerDraft | null>(null);
  readonly closed = output<void>();
  readonly saved = output<ReceiptIssuer>();

  readonly code = signal('');
  readonly name = signal('');
  readonly bankCode = signal('');
  readonly aliases = signal('');
  readonly notes = signal('');
  readonly saving = signal(false);
  readonly error = signal('');
  readonly bankOptions = signal<SelectOption[]>([]);
  private banksLoaded = false;

  readonly isEditing = computed(() => Boolean(this.draft()?.issuer));
  readonly codeError = computed(() => {
    const code = this.code().trim();
    return code && !RECEIPT_CODE_PATTERN.test(code)
      ? 'Usa minúsculas, números, guion o guion bajo, sin espacios.'
      : '';
  });
  readonly canSave = computed(
    () => Boolean(this.name().trim() && this.code().trim()) && !this.codeError(),
  );

  constructor() {
    effect(() => {
      const draft = this.draft();
      if (draft) untracked(() => this.hydrate(draft));
    });
  }

  private hydrate(draft: IssuerDraft): void {
    const issuer = draft.issuer;
    this.code.set(issuer?.code ?? draft.code ?? '');
    this.name.set(issuer?.name ?? draft.name ?? '');
    this.bankCode.set(issuer?.bankCode ?? '');
    this.aliases.set((issuer?.aliases ?? []).join('\n'));
    this.notes.set(issuer?.notes ?? '');
    this.error.set('');
    this.loadBanks();
  }

  private loadBanks(): void {
    if (this.banksLoaded) return;
    this.banksLoaded = true;
    this.banksApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ banks }) =>
          this.bankOptions.set(banks.map((bank) => ({ id: bank.code, label: bank.name }))),
        // Vincularlo es opcional: sin catálogo se puede guardar igual.
        error: () => (this.banksLoaded = false),
      });
  }

  save(): void {
    if (this.saving() || !this.canSave()) return;
    const issuer = this.draft()?.issuer;
    const name = this.name().trim();
    const bankCode = this.bankCode().trim();
    const aliases = linesToList(this.aliases());
    const notes = this.notes().trim();
    const request$ = issuer
      ? this.api.updateIssuer(issuer.id, {
          name,
          aliases,
          bankCode: bankCode || null,
          notes: notes || null,
        })
      : this.api.createIssuer({
          code: this.code().trim(),
          name,
          aliases,
          ...(bankCode ? { bankCode } : {}),
          ...(notes ? { notes } : {}),
        });

    this.saving.set(true);
    this.error.set('');
    request$
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.saved.emit(response.issuer),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }
}
