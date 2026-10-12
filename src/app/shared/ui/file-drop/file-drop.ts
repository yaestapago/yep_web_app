import { Component, ElementRef, computed, input as defineInput, output, signal, viewChild } from '@angular/core';
import { LucideFileText, LucideUpload, LucideX } from '@lucide/angular';

import { IconTile } from '../icon-tile/icon-tile';

/** Archivo que la página ya tiene elegido; el componente solo lo pinta. */
export interface FileDropItem {
  name: string;
  size: number;
  previewUrl?: string;
}

let nextFileDropId = 0;

/**
 * Zona para subir archivos (R12 · 03-componentes · yep-file-drop). Envuelve un `<input type="file">`
 * nativo y emite su evento `change` tal cual, para conectar el manejador que la página ya tiene.
 *
 * ```html
 * <yep-file-drop
 *   hint="JPG, PNG o PDF, máximo 5 MB"
 *   [files]="previewUrl() ? [{ name: fileName(), size: fileSize(), previewUrl: previewUrl() }] : []"
 *   [error]="fileError()"
 *   [removable]="true"
 *   (fileChange)="onReceiptSelected($event)"
 *   (removed)="retake()"
 * />
 * ```
 *
 * - Al soltar archivos sobre la zona los asigna al input interno y despacha un `change` nativo:
 *   la página recibe lo mismo que al elegir con el diálogo.
 * - No valida tipo ni tamaño, no lee ni sube archivos: eso sigue en la página.
 * - En celular (≤ 768 px o puntero táctil) y con `allowDrop=false` la zona se pinta como botón
 *   secundario con `buttonLabel`.
 * - Teclado: la zona es un `role="button"`; Enter o Espacio abren el selector.
 */
@Component({
  selector: 'yep-file-drop',
  imports: [IconTile, LucideFileText, LucideUpload, LucideX],
  host: {
    '[class.yep-file-drop-host--disabled]': 'disabled()',
  },
  templateUrl: './file-drop.html',
  styleUrl: './file-drop.scss',
})
export class FileDrop {
  readonly accept = defineInput('image/*,application/pdf');
  readonly multiple = defineInput(false);
  readonly label = defineInput('Arrastra el archivo o haz clic para elegirlo');
  /** Texto del botón en celular o con `allowDrop=false`. */
  readonly buttonLabel = defineInput('Elegir archivo');
  readonly hint = defineInput('');
  readonly files = defineInput<readonly FileDropItem[]>([]);
  /** 0–100 si la página conoce el avance; `null` lo oculta. */
  readonly progress = defineInput<number | null>(null);
  readonly error = defineInput('');
  readonly disabled = defineInput(false);
  readonly allowDrop = defineInput(true);
  /** Muestra el botón quitar en cada archivo. Solo si la página ya permite quitar. */
  readonly removable = defineInput(false);

  /** Evento `change` nativo del `<input type="file">` interno. */
  readonly fileChange = output<Event>();
  /** Índice del archivo a quitar. */
  readonly removed = output<number>();

  protected readonly dragging = signal(false);
  private dragDepth = 0;

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  private readonly id = nextFileDropId++;
  protected readonly hintId = `yep-file-drop-hint-${this.id}`;
  protected readonly errorId = `yep-file-drop-error-${this.id}`;

  protected readonly describedBy = computed(() => {
    const ids = [this.hint() ? this.hintId : '', this.error() ? this.errorId : ''].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  });

  protected readonly progressValue = computed(() => {
    const value = this.progress();
    if (value === null || !Number.isFinite(value)) {
      return null;
    }
    return Math.round(Math.min(100, Math.max(0, value)));
  });

  /** Abre el diálogo nativo de archivos. */
  openPicker(): void {
    if (this.disabled()) {
      return;
    }
    this.fileInput().nativeElement.click();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      this.openPicker();
    }
  }

  protected onChange(event: Event): void {
    this.fileChange.emit(event);
  }

  protected onDragEnter(event: DragEvent): void {
    if (!this.acceptsDrop(event)) {
      return;
    }
    event.preventDefault();
    this.dragDepth++;
    this.dragging.set(true);
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.acceptsDrop(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.dragging.set(true);
  }

  protected onDragLeave(): void {
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) {
      this.dragging.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    this.dragDepth = 0;
    this.dragging.set(false);
    if (!this.acceptsDrop(event)) {
      return;
    }
    event.preventDefault();

    const dropped = event.dataTransfer?.files;
    if (!dropped || dropped.length === 0) {
      return;
    }

    const input = this.fileInput().nativeElement;
    try {
      input.files = this.multiple() ? dropped : this.firstOnly(dropped);
    } catch {
      return;
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  protected remove(index: number): void {
    if (this.disabled()) {
      return;
    }
    this.removed.emit(index);
  }

  protected formatSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) {
      return '';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    const format = (value: number) => value.toLocaleString('es-CO', { maximumFractionDigits: 1 });
    if (bytes < 1024 * 1024) {
      return `${format(Math.round(bytes / 1024))} KB`;
    }
    return `${format(bytes / (1024 * 1024))} MB`;
  }

  private acceptsDrop(event: DragEvent): boolean {
    if (this.disabled() || !this.allowDrop()) {
      return false;
    }
    const types = event.dataTransfer?.types;
    // Solo archivos: arrastrar texto o enlaces no activa la zona.
    return !types || Array.from(types).includes('Files');
  }

  /** Sin `multiple`, el diálogo nativo entrega un solo archivo; al soltar se respeta lo mismo. */
  private firstOnly(files: FileList): FileList {
    if (files.length <= 1 || typeof DataTransfer === 'undefined') {
      return files;
    }
    const transfer = new DataTransfer();
    transfer.items.add(files[0]);
    return transfer.files;
  }
}
