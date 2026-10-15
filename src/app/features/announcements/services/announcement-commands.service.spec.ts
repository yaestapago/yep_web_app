import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { NotificationModalService } from '../../../shared/ui/notification-modal/notification-modal.service';
import type { Announcement } from '../models/announcement.models';
import { httpErrorMessages } from '../utils/http-error-messages';
import { AdminAnnouncementsApiService } from './admin-announcements-api.service';
import { AnnouncementCommandsService } from './announcement-commands.service';

const draft: Announcement = {
  id: 'a1',
  app: 'yep',
  status: 'draft',
  tone: 'info',
  title: 'Borrador',
  body: 'x',
  dismissible: true,
  notify: false,
  repeat: 'once',
  snoozeHours: 24,
  priority: 50,
  audience: {},
  source: 'manual',
};

describe('AnnouncementCommandsService', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let confirm: ReturnType<typeof vi.fn>;

  function service(): AnnouncementCommandsService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminAnnouncementsApiService, useValue: api },
        { provide: NotificationModalService, useValue: { confirm } },
      ],
    });
    return TestBed.inject(AnnouncementCommandsService);
  }

  beforeEach(() => {
    api = { remove: vi.fn(), setStatus: vi.fn() };
    confirm = vi.fn().mockResolvedValue(true);
  });

  it('solo se borran los borradores manuales', () => {
    expect(AnnouncementCommandsService.canDelete(draft)).toBe(true);
    expect(AnnouncementCommandsService.canDelete({ ...draft, status: 'published' })).toBe(false);
    expect(AnnouncementCommandsService.canDelete({ ...draft, source: 'system' })).toBe(false);
  });

  it('borra un borrador', async () => {
    api['remove'].mockReturnValue(of({ deleted: true, announcement: null }));
    await expect(service().remove(draft)).resolves.toEqual({
      kind: 'deleted',
      message: 'Borrador borrado.',
    });
  });

  it('si el backend lo archiva en vez de borrarlo, lo dice', async () => {
    api['remove'].mockReturnValue(
      of({ deleted: false, announcement: { ...draft, status: 'archived' } }),
    );
    const result = await service().remove(draft);
    expect(result).toEqual({
      kind: 'updated',
      announcement: expect.objectContaining({ status: 'archived' }),
      message: 'No se borró: quedó archivado.',
    });
  });

  it('cambiar de estado pide confirmación y usa PATCH status', async () => {
    api['setStatus'].mockReturnValue(of({ ...draft, status: 'published' }));
    const result = await service().changeStatus(draft, 'published');
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Publicar «Borrador»',
        confirmText: 'Publicar',
        message: ['Va para la App de YEP.', 'Sale cuando abran la App de YEP (1.2.0 o superior).'],
      }),
    );
    expect(api['setStatus']).toHaveBeenCalledWith('a1', 'published');
    expect(result).toMatchObject({ kind: 'updated', message: 'Anuncio publicado.' });
  });

  it('muestra los textos del 400 del backend', async () => {
    api['setStatus'].mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: ['startsAt debe ser anterior a endsAt'] },
          }),
      ),
    );
    await expect(service().changeStatus(draft, 'published')).resolves.toEqual({
      kind: 'error',
      message: 'startsAt debe ser anterior a endsAt',
    });
  });

  it('httpErrorMessages: arreglo del 400 o un solo texto', () => {
    expect(
      httpErrorMessages(
        new HttpErrorResponse({ status: 400, error: { message: ['uno', '', 'dos'] } }),
      ),
    ).toEqual(['uno', 'dos']);
    expect(
      httpErrorMessages(new HttpErrorResponse({ status: 404, error: { message: 'No existe' } })),
    ).toEqual(['No existe']);
  });
});
