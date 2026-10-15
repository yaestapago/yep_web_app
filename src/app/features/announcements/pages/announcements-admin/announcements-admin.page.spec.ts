import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import type { Announcement } from '../../models/announcement.models';
import { AdminAnnouncementsApiService } from '../../services/admin-announcements-api.service';
import { AnnouncementsAdminPage, toAnnouncementRow } from './announcements-admin.page';

const auto: Announcement = {
  id: 'a1',
  app: 'notifier',
  status: 'published',
  tone: 'danger',
  title: 'YEP dejó de escuchar los pagos',
  body: '…',
  action: { type: 'open_notification_access', label: 'Activar' },
  dismissible: true,
  notify: true,
  repeat: 'until_action',
  snoozeHours: 6,
  priority: 90,
  audience: { condition: 'listener_off' },
  source: 'system',
  stats: { seen: 1200, action: 3, dismissed: 4, notified: 9 },
};

const manualYep: Announcement = {
  ...auto,
  id: 'a2',
  app: 'yep',
  status: 'draft',
  tone: 'info',
  title: 'Nueva función',
  audience: { accountIds: ['b1', 'b2'] },
  source: 'manual',
  startsAt: '2026-11-01T13:00:00.000Z',
  stats: null,
};

describe('AnnouncementsAdminPage', () => {
  it('toAnnouncementRow: a quién va, estadísticas y «—» de notificados en la App de YEP', () => {
    const row = toAnnouncementRow(auto);
    expect(row.audience).toBe('Automático: escucha apagada');
    expect(row.statusLabel).toBe('Publicado');
    expect(row.seen).toBe('1.200');
    expect(row.notified).toBe('9');
    const yep = toAnnouncementRow(manualYep);
    expect(yep.appLabel).toBe('App de YEP');
    expect(yep.audience).toBe('2 negocios');
    expect(yep.notified).toBe('—');
    expect(yep.seen).toBe('0');
    expect(yep.window).toMatch(/^Desde /);
  });

  it('filtra por app y estado con los parámetros del contrato', () => {
    const list = vi.fn().mockReturnValue(of([auto, manualYep]));
    const queryParamMap = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminAnnouncementsApiService, useValue: { list } },
        { provide: NotificationModalService, useValue: { confirm: vi.fn() } },
        { provide: ActivatedRoute, useValue: { queryParamMap } },
      ],
    });
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AnnouncementsAdminPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;

    expect(list).toHaveBeenLastCalledWith({ app: null, status: null });
    expect(root.querySelectorAll('[data-testid^="announcement-row-"]').length).toBe(2);
    expect(root.textContent).toContain('Automático: escucha apagada');

    page.setAppFilter('notifier');
    expect(list).toHaveBeenLastCalledWith({ app: 'notifier', status: null });
    page.setStatusFilter('archived');
    expect(list).toHaveBeenLastCalledWith({ app: 'notifier', status: 'archived' });

    queryParamMap.next(convertToParamMap({ vista: 'versiones' }));
    expect(page.tab()).toBe('versions');
  });
});
