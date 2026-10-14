import { Component, computed, input as defineInput } from '@angular/core';

export type AvatarSize = 32 | 40 | 48;

/**
 * Avatar de iniciales (03-componentes · yep-avatar · yep-icon-tile): iniciales 600 en tinta sobre lima,
 * igual en claro y en oscuro. Los avatares no cuentan para el límite de un lima por vista (P4).
 *
 * ```html
 * <yep-avatar name="Laura Gómez" />
 * <yep-avatar [name]="business.name" [size]="48" />
 * ```
 *
 * Iniciales: primera letra de las dos primeras palabras (o las dos primeras letras si hay una sola).
 */
@Component({
  selector: 'yep-avatar',
  host: {
    role: 'img',
    '[attr.aria-label]': 'name() || null',
    '[attr.aria-hidden]': 'name() ? null : "true"',
  },
  templateUrl: './avatar.html',
  styleUrl: './avatar.scss',
})
export class Avatar {
  readonly name = defineInput.required<string>();
  readonly size = defineInput<AvatarSize>(32);

  protected readonly initials = computed(() => initialsOf(this.name()));
}

function initialsOf(name: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  const letters =
    words.length === 1
      ? Array.from(words[0]).slice(0, 2)
      : [Array.from(words[0])[0], Array.from(words[1])[0]];
  return letters.join('').toLocaleUpperCase('es');
}
