import { Component, computed, input as defineInput, ViewEncapsulation } from '@angular/core';

import { type ButtonSize, type ButtonTone, type ButtonVariant, resolveButtonTone } from './button';

/**
 * `yep-button` como enlace (03-componentes · yep-button): la página pone su propio `<a>` con
 * `routerLink` o `href` (y `target`, `rel`, `data-cy`…), y este componente solo le da la piel del
 * botón. Mismos `variant`, `size`, `tone` y `fullWidth` que `yep-button`; un enlace no tiene
 * `disabled` ni `loading` (si la acción no está disponible, no se muestra el enlace).
 *
 * ```html
 * <a yepButton [routerLink]="panelLink">Ir al panel de control</a>
 * <a yepButton variant="secondary" tone="on-brand" [href]="blogUrl" target="_blank" rel="noreferrer">
 *   Ver novedades
 * </a>
 * <a yepButton tone="ink" routerLink="/employees"><svg lucideUsers aria-hidden="true"></svg>Ir a Empleados</a>
 * ```
 *
 * Sin encapsulación: los estilos (los mismos de `yep-button`, ver `_button-skin.scss`) van sobre el
 * propio `<a>` y todos empiezan por `a.yep-button`.
 */
@Component({
  selector: 'a[yepButton]',
  host: {
    class: 'yep-button',
    '[class.yep-button--primary]': "variant() === 'primary'",
    '[class.yep-button--secondary]': "variant() === 'secondary'",
    '[class.yep-button--ghost]': "variant() === 'ghost'",
    '[class.yep-button--danger]': "variant() === 'danger'",
    '[class.yep-button--sm]': "size() === 'sm'",
    '[class.yep-button--md]': "size() === 'md'",
    '[class.yep-button--lg]': "size() === 'lg'",
    '[class.yep-button--tone-danger]': "appliedTone() === 'danger'",
    '[class.yep-button--tone-on-brand]': "appliedTone() === 'on-brand'",
    '[class.yep-button--tone-ink]': "appliedTone() === 'ink'",
    '[class.yep-button--full]': 'fullWidth()',
  },
  template: '<ng-content></ng-content>',
  styleUrl: './button-link.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ButtonLink {
  readonly variant = defineInput<ButtonVariant>('primary');
  readonly size = defineInput<ButtonSize>('md');
  readonly tone = defineInput<ButtonTone>('neutral');
  readonly fullWidth = defineInput(false);

  protected readonly appliedTone = computed(() => resolveButtonTone(this.variant(), this.tone()));
}
