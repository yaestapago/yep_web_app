import { Component, computed, input as defineInput, output } from '@angular/core';
import {
  LucidePencil,
  LucidePower,
  LucidePowerOff,
  LucideTrash2,
} from '@lucide/angular';

import { Button } from '../button/button';

/**
 * Acciones de fila estandarizadas. Cada acción define UNA sola vez su icono,
 * variante y tooltip para que todos los listados del frontend se vean iguales.
 * Añade aquí nuevas acciones en lugar de repetir `<yep-button><svg …></yep-button>`.
 */
export type IconButtonAction = 'edit' | 'delete' | 'activate' | 'deactivate';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface IconButtonPreset {
  variant: ButtonVariant;
  label: string;
}

const PRESETS: Record<IconButtonAction, IconButtonPreset> = {
  edit: { variant: 'ghost', label: 'Editar' },
  delete: { variant: 'danger', label: 'Eliminar' },
  activate: { variant: 'secondary', label: 'Activar' },
  deactivate: { variant: 'ghost', label: 'Desactivar' },
};

/**
 * Botón de acción sólo-icono, reutilizable en toda la app.
 *
 * ```html
 * <yep-icon-button action="edit" (clicked)="openEdit(row)" />
 * <yep-icon-button action="delete" [loading]="acting()" (clicked)="remove(row)" />
 * ```
 *
 * El tooltip/`aria-label` sale del preset; usa `label` sólo para sobrescribirlo
 * (p. ej. "Quitar" en vez de "Eliminar") sin romper la uniformidad visual.
 */
@Component({
  selector: 'yep-icon-button',
  imports: [Button, LucidePencil, LucidePower, LucidePowerOff, LucideTrash2],
  templateUrl: './icon-button.html',
})
export class IconButton {
  readonly action = defineInput.required<IconButtonAction>();
  readonly loading = defineInput(false);
  readonly disabled = defineInput(false);
  readonly size = defineInput<'sm' | 'md' | 'lg'>('sm');
  /** Sobrescribe el tooltip/aria-label del preset. */
  readonly label = defineInput('');

  readonly clicked = output<MouseEvent>();

  readonly variant = computed<ButtonVariant>(() => PRESETS[this.action()].variant);
  readonly title = computed(() => this.label() || PRESETS[this.action()].label);
}
