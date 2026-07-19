import { DOCUMENT } from '@angular/common';
import { Component, OnDestroy, effect, inject, input as defineInput, output } from '@angular/core';
import { LucideX } from '@lucide/angular';

type ModalSize = 'sm' | 'md' | 'lg';

let bodyScrollLockCount = 0;
let previousBodyOverflow: string | null = null;

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
export class Modal implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private bodyScrollLocked = false;

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
      this.syncBodyScrollLock(this.open());
    });
  }

  ngOnDestroy(): void {
    this.syncBodyScrollLock(false);
  }

  private syncBodyScrollLock(shouldLock: boolean): void {
    if (shouldLock && !this.bodyScrollLocked) {
      this.lockBodyScroll();
      this.bodyScrollLocked = true;
      return;
    }

    if (!shouldLock && this.bodyScrollLocked) {
      this.unlockBodyScroll();
      this.bodyScrollLocked = false;
    }
  }

  private lockBodyScroll(): void {
    const body = this.document.body;
    if (!body) {
      return;
    }

    if (bodyScrollLockCount === 0) {
      previousBodyOverflow = body.style.overflow;
      body.style.overflow = 'hidden';
    }

    bodyScrollLockCount += 1;
  }

  private unlockBodyScroll(): void {
    const body = this.document.body;
    if (!body) {
      return;
    }

    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);

    if (bodyScrollLockCount === 0) {
      body.style.overflow = previousBodyOverflow ?? '';
      previousBodyOverflow = null;
    }
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
