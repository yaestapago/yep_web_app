import { DOCUMENT } from '@angular/common';
import { Component, effect, inject, input as defineInput, output } from '@angular/core';
import { LucideX } from '@lucide/angular';

type ModalSize = 'sm' | 'md' | 'lg';

/**
 * Modal reutilizable con proyección de contenido.
 *
 * Uso:
 * ```html
 * <yep-modal [open]="open()" title="Crear negocio" (closeRequested)="close()">
 *   <form ...>...</form>
 *   <ng-container modalFooter>
 *     <yep-button variant="ghost" (clicked)="close()">Cancelar</yep-button>
 *     <yep-button type="submit" [loading]="saving()">Guardar</yep-button>
 *   </ng-container>
 * </yep-modal>
 * ```
 *
 * El cierre se delega siempre al padre via `closeRequested` para permitir
 * flujos seguros cuando una vista necesita confirmar cambios sin guardar.
 */
@Component({
  selector: 'yep-modal',
  imports: [LucideX],
  templateUrl: './modal.html',
  styleUrl: './modal.scss',
})
export class Modal {
  private readonly document = inject(DOCUMENT);

  readonly open = defineInput(false);
  readonly title = defineInput('');
  readonly subtitle = defineInput('');
  readonly size = defineInput<ModalSize>('md');
  readonly showHeader = defineInput(true);
  /** Estado de carga: deshabilita el botón de cerrar de la cabecera. */
  readonly loading = defineInput(false);
  /** Permite cerrar al hacer clic en el fondo. */
  readonly dismissOnBackdrop = defineInput(true);

  /** Solicitud de cierre (cancelar, ESC, fondo o botón X). El padre decide. */
  readonly closeRequested = output<void>();

  constructor() {
    // Bloquea el scroll del body mientras el modal está abierto.
    effect(() => {
      const body = this.document.body;
      if (!body) {
        return;
      }
      body.style.overflow = this.open() ? 'hidden' : '';
    });
  }

  requestClose(): void {
    if (this.loading()) {
      return;
    }

    this.closeRequested.emit();
  }

  onBackdropClick(): void {
    if (this.dismissOnBackdrop()) {
      this.requestClose();
    }
  }

  onEscape(event: Event): void {
    if (!this.open()) {
      return;
    }
    event.stopPropagation();
    this.requestClose();
  }
}
