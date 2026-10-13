import { Component, computed, input as defineInput, output } from '@angular/core';
import {
  LucideDynamicIcon,
  type LucideIcon,
  LucidePencil,
  LucidePower,
  LucidePowerOff,
  LucideTrash2,
} from '@lucide/angular';

/**
 * Acciones de fila estandarizadas. Cada acción define UNA sola vez su icono,
 * tono y tooltip para que todos los listados del frontend se vean iguales.
 * Añade aquí nuevas acciones en lugar de repetir `<yep-button><svg …></yep-button>`.
 */
export type IconButtonAction = 'edit' | 'delete' | 'activate' | 'deactivate';

/** `danger` pinta el icono en `--color-error-strong`. */
export type IconButtonTone = 'neutral' | 'danger';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface IconButtonPreset {
  /** Conservado por compatibilidad; el rediseño pinta todas las acciones como `ghost`. */
  variant: ButtonVariant;
  tone: IconButtonTone;
  label: string;
}

const PRESETS: Record<IconButtonAction, IconButtonPreset> = {
  edit: { variant: 'ghost', tone: 'neutral', label: 'Editar' },
  delete: { variant: 'danger', tone: 'danger', label: 'Eliminar' },
  activate: { variant: 'secondary', tone: 'neutral', label: 'Activar' },
  deactivate: { variant: 'ghost', tone: 'neutral', label: 'Desactivar' },
};

/**
 * Botón de acción sólo-icono, reutilizable en toda la app (P3: `ghost`, sin borde).
 *
 * ```html
 * <yep-icon-button action="edit" (clicked)="openEdit(row)" />
 * <yep-icon-button action="delete" [loading]="acting()" (clicked)="remove(row)" />
 * ```
 *
 * El tooltip/`aria-label` sale del preset; usa `label` sólo para sobrescribirlo
 * (p. ej. "Quitar" en vez de "Eliminar") sin romper la uniformidad visual.
 * `tone="danger"` pinta el icono en rojo; la acción `delete` ya lo es por preset.
 *
 * Icono libre: pasa la clase del icono Lucide en `icon` y un `label` (obligatorio:
 * va a `aria-label` y `title`). Si hay `icon`, se dibuja ése en lugar del de `action`.
 *
 * ```ts
 * protected readonly closeIcon = LucideX;
 * ```
 * ```html
 * <yep-icon-button [icon]="closeIcon" label="Cerrar" size="md" (clicked)="close()" />
 * ```
 */
@Component({
  selector: 'yep-icon-button',
  imports: [LucideDynamicIcon, LucidePencil, LucidePower, LucidePowerOff, LucideTrash2],
  templateUrl: './icon-button.html',
  styleUrl: './icon-button.scss',
})
export class IconButton {
  /** Acción de fila con preset de icono, tono y tooltip. Opcional si se usa `icon`. */
  readonly action = defineInput<IconButtonAction | null>(null);
  /** Icono Lucide libre (p. ej. `LucideX`). Tiene prioridad sobre el icono de `action`; exige `label`. */
  readonly icon = defineInput<LucideIcon | null>(null);
  readonly loading = defineInput(false);
  readonly disabled = defineInput(false);
  readonly size = defineInput<'sm' | 'md' | 'lg'>('sm');
  /** Tooltip/aria-label. Sobrescribe el del preset; obligatorio con `icon`. */
  readonly label = defineInput('');
  readonly tone = defineInput<IconButtonTone>('neutral');

  readonly clicked = output<MouseEvent>();

  /** @deprecated Solo informativo; ya no cambia el aspecto. */
  readonly variant = computed<ButtonVariant>(() => this.preset()?.variant ?? 'ghost');
  readonly title = computed(() => this.label() || this.preset()?.label || null);
  /** Tono efectivo: `danger` si se pide o si la acción lo trae por preset. */
  readonly appliedTone = computed<IconButtonTone>(() =>
    this.tone() === 'danger' ? 'danger' : (this.preset()?.tone ?? 'neutral'),
  );

  private readonly preset = computed<IconButtonPreset | null>(() => {
    const action = this.action();
    return action ? PRESETS[action] : null;
  });

  onClick(event: MouseEvent): void {
    if (this.disabled() || this.loading()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.clicked.emit(event);
  }
}
