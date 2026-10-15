import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { NotificationModalService } from '../../../shared/ui/notification-modal/notification-modal.service';
import { httpErrorMessages } from '../utils/http-error-messages';
import type { Announcement, AnnouncementStatus } from '../models/announcement.models';
import { appInSentence } from '../utils/announcement-labels';
import { AdminAnnouncementsApiService } from './admin-announcements-api.service';

export type AnnouncementCommandResult =
  | { kind: 'updated'; announcement: Announcement; message: string }
  | { kind: 'deleted'; message: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

/**
 * Publicar, pasar a borrador, archivar y borrar con su confirmación. Lo usan la lista, el
 * detalle y el editor para que los textos y las reglas sean las mismas en todas partes.
 */
@Injectable({ providedIn: 'root' })
export class AnnouncementCommandsService {
  private readonly api = inject(AdminAnnouncementsApiService);
  private readonly notifications = inject(NotificationModalService);

  /** Texto de cuándo empieza a salir, por app. */
  static deliveryHint(app: Announcement['app']): string {
    return app === 'notifier'
      ? 'Sale en el próximo latido de cada celular (Notificador 1.0.10 o superior).'
      : 'Sale cuando abran la App de YEP (1.2.0 o superior).';
  }

  async changeStatus(
    announcement: Announcement,
    status: AnnouncementStatus,
  ): Promise<AnnouncementCommandResult> {
    const copy = STATUS_COPY[status];
    const confirmed = await this.notifications.confirm({
      title: `${copy.verb} «${announcement.title}»`,
      message:
        status === 'published'
          ? [
              `Va ${appInSentence(announcement.app, 'para')}.`,
              AnnouncementCommandsService.deliveryHint(announcement.app),
            ]
          : copy.message,
      type: status === 'archived' ? 'warning' : 'question',
      confirmText: copy.verb,
      cancelText: 'Cancelar',
    });
    if (!confirmed) return { kind: 'cancelled' };
    try {
      const updated = await firstValueFrom(this.api.setStatus(announcement.id, status));
      return { kind: 'updated', announcement: { ...announcement, ...updated }, message: copy.done };
    } catch (error) {
      return { kind: 'error', message: httpErrorMessages(error).join(' ') };
    }
  }

  /** Se puede borrar un borrador manual; los automáticos se recrearían al arrancar el backend. */
  static canDelete(announcement: Pick<Announcement, 'status' | 'source'>): boolean {
    return announcement.status === 'draft' && announcement.source !== 'system';
  }

  /** Borra un borrador manual. Si el backend decide archivarlo, se informa así. */
  async remove(announcement: Announcement): Promise<AnnouncementCommandResult> {
    if (!AnnouncementCommandsService.canDelete(announcement)) {
      return {
        kind: 'error',
        message: 'Solo se pueden borrar los borradores que creaste tú. Archívalo.',
      };
    }
    const confirmed = await this.notifications.confirm({
      title: `Borrar «${announcement.title}»`,
      message: 'El borrador se borra para siempre.',
      type: 'warning',
      confirmText: 'Borrar',
      cancelText: 'Cancelar',
    });
    if (!confirmed) return { kind: 'cancelled' };
    try {
      const result = await firstValueFrom(this.api.remove(announcement.id));
      if (!result.deleted) {
        return {
          kind: 'updated',
          announcement: result.announcement ?? { ...announcement, status: 'archived' },
          message: 'No se borró: quedó archivado.',
        };
      }
      return { kind: 'deleted', message: 'Borrador borrado.' };
    } catch (error) {
      return { kind: 'error', message: httpErrorMessages(error).join(' ') };
    }
  }
}

const STATUS_COPY: Record<AnnouncementStatus, { verb: string; message: string; done: string }> = {
  published: { verb: 'Publicar', message: '', done: 'Anuncio publicado.' },
  draft: {
    verb: 'Pasar a borrador',
    message: 'Deja de salir en los celulares hasta que lo vuelvas a publicar.',
    done: 'El anuncio quedó como borrador.',
  },
  archived: {
    verb: 'Archivar',
    message: 'Deja de salir en los celulares. Puedes volver a publicarlo cuando quieras.',
    done: 'Anuncio archivado.',
  },
};
