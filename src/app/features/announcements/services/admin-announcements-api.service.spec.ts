import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import type { AnnouncementPayload } from '../models/announcement.models';
import { AdminAnnouncementsApiService } from './admin-announcements-api.service';

const BASE = `${environment.apiUrl}/admin/announcements`;
const RELEASES = `${environment.apiUrl}/admin/app-releases`;

const rawAnnouncement = {
  _id: '6710c0ffee0000000000abcd',
  app: 'notifier',
  status: 'published',
  kind: 'auto',
  tone: 'danger',
  title: 'YEP dejó de escuchar los pagos',
  body: 'Toca «Activar».',
  action: { type: 'open_notification_access', label: 'Activar' },
  dismissible: true,
  notify: true,
  repeat: 'until_action',
  snoozeHours: 6,
  priority: 90,
  audience: { condition: 'listener_off' },
  source: 'system',
  systemKey: 'auto:listener_off',
  stats: { seen: 12, action: 3, dismissed: 4, notified: 9 },
};

const payload: AnnouncementPayload = {
  app: 'yep',
  status: 'draft',
  tone: 'info',
  title: 'Nueva función',
  body: 'Mira la novedad.',
  action: { type: 'open_route', label: 'Ver', route: '/home' },
  dismissible: true,
  notify: false,
  repeat: 'once',
  snoozeHours: 24,
  priority: 50,
  audience: { accountIds: [], userIds: [], roles: ['account_owner'], platforms: ['ios'] },
};

describe('AdminAnnouncementsApiService (contrato · Endpoints → Panel)', () => {
  let service: AdminAnnouncementsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminAnnouncementsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GET /admin/announcements sin filtros no manda parámetros', () => {
    let result: unknown;
    service.list().subscribe((items) => (result = items));
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ announcements: [rawAnnouncement] });
    expect(result).toEqual([
      expect.objectContaining({
        id: '6710c0ffee0000000000abcd',
        app: 'notifier',
        source: 'system',
        audience: expect.objectContaining({ condition: 'listener_off', accountIds: [] }),
        stats: { seen: 12, action: 3, dismissed: 4, notified: 9 },
      }),
    ]);
  });

  it('GET /admin/announcements?status=&app= con filtros; acepta también un arreglo', () => {
    let count = -1;
    service.list({ status: 'draft', app: 'yep' }).subscribe((items) => (count = items.length));
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('status')).toBe('draft');
    expect(req.request.params.get('app')).toBe('yep');
    req.flush([rawAnnouncement, rawAnnouncement]);
    expect(count).toBe(2);
  });

  it('GET /admin/announcements/:id desenvuelve { announcement }', () => {
    let title = '';
    service.get('abc').subscribe((item) => (title = item.title));
    const req = http.expectOne(`${BASE}/abc`);
    expect(req.request.method).toBe('GET');
    req.flush({ announcement: rawAnnouncement });
    expect(title).toBe('YEP dejó de escuchar los pagos');
  });

  it('GET /admin/announcements/:id/receipts?limit=50&skip=0 y normaliza el nombre legible', () => {
    let page: unknown;
    service.receipts('abc').subscribe((value) => (page = value));
    const req = http.expectOne((r) => r.url === `${BASE}/abc/receipts`);
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.params.get('skip')).toBe('0');
    // Forma exacta del backend (`backend/src/announcements`).
    req.flush({
      announcementKey: 'abc',
      total: 2,
      limit: 50,
      skip: 0,
      receipts: [
        {
          id: 'r1',
          announcementKey: 'abc',
          recipientType: 'notifier',
          recipientId: 'n1',
          recipientName: 'Caja principal',
          deviceModel: 'Redmi Note 12',
          email: null,
          accountId: 'b1',
          accountName: 'Supercarnes',
          appVersion: '1.0.10',
          platform: 'android',
          firstSeenAt: '2026-10-15T11:00:00.000Z',
          lastSeenAt: '2026-10-15T12:00:00.000Z',
          seenCount: 2,
          notifiedAt: null,
          actionAt: null,
          dismissedAt: null,
          dismissCount: 0,
          createdAt: '2026-10-15T11:00:00.000Z',
          updatedAt: '2026-10-15T12:00:00.000Z',
        },
        {
          id: 'r2',
          announcementKey: 'abc',
          recipientType: 'user',
          recipientId: 'u1',
          recipientName: 'ana@negocio.co',
          deviceModel: null,
          email: 'ana@negocio.co',
          accountId: null,
          accountName: null,
          appVersion: '1.2.0',
          platform: 'ios',
          seenCount: 1,
          dismissCount: 0,
        },
      ],
    });
    expect(page).toEqual({
      total: 2,
      receipts: [
        expect.objectContaining({
          id: 'r1',
          recipientName: 'Caja principal',
          recipientDetail: 'Redmi Note 12',
          accountName: 'Supercarnes',
          seenCount: 2,
          platform: 'android',
          firstSeenAt: '2026-10-15T11:00:00.000Z',
        }),
        expect.objectContaining({
          recipientType: 'user',
          recipientName: 'ana@negocio.co',
          email: 'ana@negocio.co',
          recipientDetail: null,
          platform: 'ios',
        }),
      ],
    });
  });

  it('receipts acepta la key del aviso de actualizar', () => {
    service.receipts('update:notifier:android:1.0.10').subscribe();
    const req = http.expectOne(
      (r) => r.url === `${BASE}/${encodeURIComponent('update:notifier:android:1.0.10')}/receipts`,
    );
    req.flush({ receipts: [], total: 0 });
  });

  it('receipts pagina con skip', () => {
    service.receipts('abc', { limit: 50, skip: 100 }).subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/abc/receipts`);
    expect(req.request.params.get('skip')).toBe('100');
    req.flush([]);
  });

  it('POST /admin/announcements manda el cuerpo tal cual', () => {
    service.create(payload).subscribe();
    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ announcement: { ...payload, id: 'new1', kind: 'manual', source: 'manual' } });
  });

  it('PATCH /admin/announcements/:id para editar y para cambiar de estado', () => {
    service.update('a1', { title: 'Otro' }).subscribe();
    const edit = http.expectOne(`${BASE}/a1`);
    expect(edit.request.method).toBe('PATCH');
    expect(edit.request.body).toEqual({ title: 'Otro' });
    edit.flush({ announcement: rawAnnouncement });

    service.setStatus('a1', 'published').subscribe();
    const publish = http.expectOne(`${BASE}/a1`);
    expect(publish.request.method).toBe('PATCH');
    expect(publish.request.body).toEqual({ status: 'published' });
    publish.flush({ announcement: rawAnnouncement });
  });

  it('DELETE /admin/announcements/:id: borrado o archivado', () => {
    let result: unknown;
    service.remove('a1').subscribe((value) => (result = value));
    const deleted = http.expectOne(`${BASE}/a1`);
    expect(deleted.request.method).toBe('DELETE');
    deleted.flush({ deleted: true, announcement: null });
    expect(result).toEqual({ deleted: true, announcement: null });

    service.remove('a1').subscribe((value) => (result = value));
    http
      .expectOne(`${BASE}/a1`)
      .flush({ deleted: false, announcement: { ...rawAnnouncement, status: 'archived' } });
    expect(result).toEqual({
      deleted: false,
      announcement: expect.objectContaining({ status: 'archived', kind: 'auto' }),
    });
  });

  it('POST /admin/announcements/audience-preview con { app, audience }', () => {
    let result: unknown;
    service
      .audiencePreview('notifier', {
        accountIds: ['b1'],
        notifierIds: [],
        platforms: [],
        condition: 'listener_off',
      })
      .subscribe((value) => (result = value));
    const req = http.expectOne(`${BASE}/audience-preview`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      app: 'notifier',
      audience: { accountIds: ['b1'], notifierIds: [], platforms: [], condition: 'listener_off' },
    });
    req.flush({ notifiers: 7 });
    expect(result).toEqual({ notifiers: 7 });
  });

  it('GET /admin/app-releases devuelve políticas y versiones en uso', () => {
    let result: unknown;
    service.listReleases().subscribe((value) => (result = value));
    const req = http.expectOne(RELEASES);
    expect(req.request.method).toBe('GET');
    req.flush({
      releases: [
        {
          id: 'rel1',
          app: 'notifier',
          platform: 'android',
          latestVersion: '1.0.10',
          minSupportedVersion: '1.0.9',
          storeUrl: 'https://play.google.com/store/apps/details?id=co.yaestapago.notifier',
          title: null,
          body: null,
          notify: true,
          enabled: true,
          updatedAt: '2026-10-15T12:00:00.000Z',
          key: 'update:notifier:android:1.0.10',
          stats: { seen: 9, action: 4, dismissed: 3, notified: 6 },
        },
      ],
      notifierVersions: [
        { version: '1.0.9', count: 4 },
        { version: null, count: 1 },
      ],
    });
    expect(result).toEqual({
      releases: [
        expect.objectContaining({
          id: 'rel1',
          key: 'update:notifier:android:1.0.10',
          latestVersion: '1.0.10',
          minSupportedVersion: '1.0.9',
          title: null,
          stats: { seen: 9, action: 4, dismissed: 3, notified: 6 },
        }),
      ],
      notifierVersions: [
        { version: '1.0.9', count: 4 },
        { version: null, count: 1 },
      ],
    });
  });

  it('PUT /admin/app-releases/:app/:platform', () => {
    const body = {
      latestVersion: '1.2.0',
      minSupportedVersion: null,
      storeUrl: 'https://apps.apple.com/co/app/yep/id1',
      title: null,
      body: null,
      notify: true,
      enabled: true,
    };
    service.saveRelease('yep', 'ios', body).subscribe();
    const req = http.expectOne(`${RELEASES}/yep/ios`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush({ release: { app: 'yep', platform: 'ios', ...body } });
  });
});
