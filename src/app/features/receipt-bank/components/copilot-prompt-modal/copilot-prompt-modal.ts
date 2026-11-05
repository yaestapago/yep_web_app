import { Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import type { ReceiptPromptKind } from '../../../../shared/models/receipt-bank.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { Modal } from '../../../../shared/ui/modal/modal';
import { State } from '../../../../shared/ui/state/state';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { ReceiptBankApiService } from '../../services/receipt-bank-api.service';

const MAX_PROMPT_LENGTH = 20000;

/**
 * Editor del prompt del copiloto de comprobantes, igual que en Gestión de bancos. Hay uno para
 * reconocer y otro para generar reglas; ninguno cambia el prompt de bancos.
 */
@Component({
  selector: 'app-copilot-prompt-modal',
  imports: [Alert, Button, Modal, State],
  template: `
    <yep-modal
      size="lg"
      [open]="kind() !== null"
      [title]="kind() === 'classify' ? 'Prompt para reconocer comprobantes' : 'Prompt para generar reglas'"
      subtitle="Aplica a todos los bancos emisores. El prompt de Gestión de bancos no cambia."
      [loading]="saving()"
      (closeRequested)="closed.emit()"
    >
      @if (loading()) {
        <yep-state kind="loading" [rows]="5" />
      } @else if (error() && !loaded()) {
        <yep-alert variant="error">{{ error() }}</yep-alert>
      } @else {
        <div class="prompt">
          <p class="prompt__hint">
            {{ isDefault() ? 'Estás usando el prompt por defecto.' : 'Este prompt está personalizado.' }}
            Marcadores:
            @if (kind() === 'classify') {
              <code>{{ '{{catalog}}' }}</code>.
            } @else {
              <code>{{ '{{fields}}' }}</code> y <code>{{ '{{fewShot}}' }}</code>.
            }
            Solo viaja texto anonimizado, y la advertencia de que el texto es un dato se agrega siempre.
          </p>
          <textarea
            class="prompt__text"
            rows="14"
            spellcheck="false"
            aria-label="Texto del prompt"
            [maxLength]="maxLength"
            [value]="text()"
            (input)="text.set($any($event.target).value)"
          ></textarea>
          @if (error()) {
            <yep-alert variant="error">{{ error() }}</yep-alert>
          }
        </div>
      }
      <ng-container modalFooter>
        <yep-button variant="ghost" [disabled]="saving() || !loaded()" (clicked)="restoreDefault()">
          Restaurar por defecto
        </yep-button>
        <yep-button [loading]="saving()" [disabled]="!loaded()" (clicked)="save()">Guardar prompt</yep-button>
      </ng-container>
    </yep-modal>
  `,
  styleUrl: './copilot-prompt-modal.scss',
})
export class CopilotPromptModal {
  private readonly api = inject(ReceiptBankApiService);
  private readonly destroyRef = inject(DestroyRef);

  /** `null` = cerrado. */
  readonly kind = input<ReceiptPromptKind | null>(null);
  readonly closed = output<void>();
  readonly saved = output<string>();

  readonly maxLength = MAX_PROMPT_LENGTH;
  readonly text = signal('');
  readonly isDefault = signal(true);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  private defaultPrompt = '';

  constructor() {
    effect(() => {
      const kind = this.kind();
      if (kind) untracked(() => this.load(kind));
    });
  }

  private load(kind: ReceiptPromptKind): void {
    this.loading.set(true);
    this.loaded.set(false);
    this.error.set('');
    this.api
      .getCopilotPrompt(kind)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.text.set(response.prompt);
          this.isDefault.set(response.isDefault);
          this.defaultPrompt = response.default;
          this.loaded.set(true);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  save(): void {
    this.persist(this.text());
  }

  /** Vacío restaura el de por defecto en el backend. */
  restoreDefault(): void {
    this.persist('');
  }

  private persist(prompt: string): void {
    const kind = this.kind();
    if (!kind || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api
      .saveCopilotPrompt(kind, prompt)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ isDefault }) => {
          this.isDefault.set(isDefault);
          if (isDefault) this.text.set(this.defaultPrompt);
          this.saved.emit(
            isDefault
              ? 'Prompt restaurado. Vale para las próximas solicitudes.'
              : 'Prompt guardado. Vale para las próximas solicitudes.',
          );
          this.closed.emit();
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }
}
