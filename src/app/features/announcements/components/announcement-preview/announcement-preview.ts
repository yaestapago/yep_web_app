import { Component, computed, input } from '@angular/core';
import {
  LucideBell,
  LucideCircleAlert,
  LucideCircleCheck,
  LucideInfo,
  LucideLock,
  LucideTriangleAlert,
} from '@lucide/angular';

import type {
  AnnouncementActionType,
  AnnouncementApp,
  AnnouncementRepeat,
  AnnouncementTone,
} from '../../models/announcement.models';
import {
  APP_LABELS,
  TONE_LABELS,
  dismissLabelFor,
  isActionAllowed,
} from '../../utils/announcement-labels';

/**
 * Vista previa del modal tal como lo pinta el celular (contrato · `AnnouncementDto`):
 * tono, título, cuerpo, botón principal y «Cerrar»/«Más tarde». Si el anuncio del
 * Notificador avisa con notificación, también muestra la de Android («Avisos de YEP»).
 * Es solo dibujo: nada es interactivo.
 */
@Component({
  selector: 'app-announcement-preview',
  imports: [
    LucideBell,
    LucideCircleAlert,
    LucideCircleCheck,
    LucideInfo,
    LucideLock,
    LucideTriangleAlert,
  ],
  templateUrl: './announcement-preview.html',
  styleUrl: './announcement-preview.scss',
})
export class AnnouncementPreview {
  readonly app = input<AnnouncementApp>('notifier');
  readonly tone = input<AnnouncementTone>('info');
  readonly title = input('');
  readonly body = input('');
  readonly actionType = input<AnnouncementActionType | '' | null>('');
  readonly actionLabel = input('');
  readonly dismissible = input(true);
  readonly repeat = input<AnnouncementRepeat>('once');
  readonly notify = input(false);
  /** Texto bajo el celular; vacío = el de por defecto. */
  readonly caption = input('');

  protected readonly toneLabels = TONE_LABELS;

  readonly appName = computed(() => (this.app() === 'notifier' ? 'YEP Notifyer' : 'YEP'));

  readonly displayTitle = computed(() => this.title().trim() || 'Título del aviso');
  readonly displayBody = computed(
    () => this.body().trim() || 'Aquí va el mensaje que verá la persona en su celular.',
  );
  readonly isPlaceholder = computed(() => !this.title().trim() && !this.body().trim());

  /** Botón principal: solo si la app entiende la acción (un tipo desconocido no se pinta). */
  readonly primaryLabel = computed(() => {
    const type = this.actionType();
    if (!type || !isActionAllowed(this.app(), type)) return '';
    return this.actionLabel().trim() || 'Texto del botón';
  });

  /** Sin botón, el modal siempre se puede cerrar (contrato). */
  readonly canDismiss = computed(() => this.dismissible() || !this.primaryLabel());
  readonly dismissLabel = computed(() => dismissLabelFor(this.repeat()));

  readonly showNotification = computed(() => this.app() === 'notifier' && this.notify());

  readonly captionText = computed(
    () =>
      this.caption() ||
      (this.app() === 'notifier'
        ? `Así se verá en el ${APP_LABELS.notifier} (Android).`
        : `Así se verá en la ${APP_LABELS.yep}.`),
  );
}
