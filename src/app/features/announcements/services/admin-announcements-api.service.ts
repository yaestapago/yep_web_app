import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type {
  Announcement,
  AnnouncementApp,
  AnnouncementAudience,
  AnnouncementDeleteResult,
  AnnouncementListQuery,
  AnnouncementPayload,
  AnnouncementPlatform,
  AnnouncementReceipt,
  AnnouncementReceiptsPage,
  AnnouncementStats,
  AnnouncementStatus,
  AppRelease,
  AppReleasePayload,
  AppReleasesResponse,
  AudiencePreviewResponse,
  NotifierVersionCount,
} from '../models/announcement.models';

type Raw = Record<string, unknown>;

/**
 * Panel superadmin de anuncios y versiones de las apps (`JwtAuthGuard` + `AccountSuGuard`).
 * Las rutas `/admin/announcements` y `/admin/app-releases` no están en la lista del
 * interceptor: viajan solo con el Bearer, sin `x-business-account-id`.
 *
 * Respuestas del backend (`backend/src/announcements`): `{ announcements }`,
 * `{ announcement }`, `{ receipts, total, limit, skip }`, `{ deleted, announcement }`,
 * `{ releases, notifierVersions }` y `{ release }`. Los normalizadores toleran además un
 * arreglo pelado y `_id`, por si cambia el envoltorio.
 */
@Injectable({ providedIn: 'root' })
export class AdminAnnouncementsApiService {
  private readonly http = inject(HttpClient);
  private readonly announcementsUrl = `${environment.apiUrl}/admin/announcements`;
  private readonly releasesUrl = `${environment.apiUrl}/admin/app-releases`;

  list(query: AnnouncementListQuery = {}): Observable<Announcement[]> {
    let params = new HttpParams();
    if (query.status) params = params.set('status', query.status);
    if (query.app) params = params.set('app', query.app);
    return this.http
      .get<unknown>(this.announcementsUrl, { params })
      .pipe(map((body) => listOf(body, ['announcements', 'items']).map(normalizeAnnouncement)));
  }

  get(id: string): Observable<Announcement> {
    return this.http
      .get<unknown>(`${this.announcementsUrl}/${encodeURIComponent(id)}`)
      .pipe(map((body) => normalizeAnnouncement(unwrap(body, 'announcement'))));
  }

  receipts(
    id: string,
    page: { limit?: number; skip?: number } = {},
  ): Observable<AnnouncementReceiptsPage> {
    const params = new HttpParams().set('limit', page.limit ?? 50).set('skip', page.skip ?? 0);
    return this.http
      .get<unknown>(`${this.announcementsUrl}/${encodeURIComponent(id)}/receipts`, { params })
      .pipe(
        map((body) => ({
          receipts: listOf(body, ['receipts', 'items']).map(normalizeReceipt),
          total: totalOf(body),
        })),
      );
  }

  create(payload: AnnouncementPayload): Observable<Announcement> {
    return this.http
      .post<unknown>(this.announcementsUrl, payload)
      .pipe(map((body) => normalizeAnnouncement(unwrap(body, 'announcement'))));
  }

  update(id: string, patch: Partial<AnnouncementPayload>): Observable<Announcement> {
    return this.http
      .patch<unknown>(`${this.announcementsUrl}/${encodeURIComponent(id)}`, patch)
      .pipe(map((body) => normalizeAnnouncement(unwrap(body, 'announcement'))));
  }

  /** Publicar, pasar a borrador o archivar (al publicar el backend fija `publishedAt`). */
  setStatus(id: string, status: AnnouncementStatus): Observable<Announcement> {
    return this.update(id, { status });
  }

  /** Borra un borrador manual; lo demás (incluidos los automáticos) el backend lo archiva. */
  remove(id: string): Observable<AnnouncementDeleteResult> {
    return this.http.delete<unknown>(`${this.announcementsUrl}/${encodeURIComponent(id)}`).pipe(
      map((body) => {
        const raw = isRecord(body) ? body : {};
        const announcement = isRecord(raw['announcement'])
          ? normalizeAnnouncement(raw['announcement'] as Raw)
          : null;
        return { deleted: raw['deleted'] !== false, announcement };
      }),
    );
  }

  /** Aproximado: ignora filtros de versión para usuarios; condiciones sobre la foto guardada. */
  audiencePreview(
    app: AnnouncementApp,
    audience: AnnouncementAudience,
  ): Observable<AudiencePreviewResponse> {
    return this.http.post<AudiencePreviewResponse>(`${this.announcementsUrl}/audience-preview`, {
      app,
      audience,
    });
  }

  listReleases(): Observable<AppReleasesResponse> {
    return this.http.get<unknown>(this.releasesUrl).pipe(
      map((body) => {
        const raw = (isRecord(body) ? body : {}) as Raw;
        return {
          releases: listOf(raw['releases'], []).map(normalizeRelease),
          notifierVersions: listOf(raw['notifierVersions'], []).map(normalizeVersionCount),
        };
      }),
    );
  }

  saveRelease(
    app: AnnouncementApp,
    platform: AnnouncementPlatform,
    payload: AppReleasePayload,
  ): Observable<AppRelease> {
    return this.http
      .put<unknown>(`${this.releasesUrl}/${app}/${platform}`, payload)
      .pipe(map((body) => normalizeRelease(unwrap(body, 'release'))));
  }
}

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listOf(body: unknown, keys: string[]): Raw[] {
  if (Array.isArray(body)) return body.filter(isRecord);
  if (isRecord(body)) {
    for (const key of keys) {
      const value = body[key];
      if (Array.isArray(value)) return value.filter(isRecord);
    }
  }
  return [];
}

function unwrap(body: unknown, key: string): Raw {
  if (isRecord(body) && isRecord(body[key])) return body[key] as Raw;
  return isRecord(body) ? body : {};
}

function totalOf(body: unknown): number | null {
  if (!isRecord(body)) return null;
  const direct = body['total'];
  if (typeof direct === 'number') return direct;
  const pagination = body['pagination'];
  if (isRecord(pagination) && typeof pagination['total'] === 'number') {
    return pagination['total'];
  }
  return null;
}

function str(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function idOf(raw: Raw): string {
  return str(raw['id']) ?? str(raw['_id']) ?? '';
}

function stringList<T extends string = string>(value: unknown): T[] {
  return Array.isArray(value)
    ? (value.map((item) => str(item)).filter((item): item is string => !!item) as T[])
    : [];
}

export function normalizeAnnouncement(raw: Raw): Announcement {
  const audience = isRecord(raw['audience']) ? (raw['audience'] as Raw) : {};
  const action = isRecord(raw['action']) ? (raw['action'] as Raw) : null;
  const condition = (str(audience['condition']) as AnnouncementAudience['condition']) ?? null;
  return {
    id: idOf(raw),
    app: raw['app'] === 'yep' ? 'yep' : 'notifier',
    status: (str(raw['status']) as Announcement['status']) ?? 'draft',
    kind: raw['kind'] === 'auto' || (!raw['kind'] && condition) ? 'auto' : 'manual',
    tone: (str(raw['tone']) as Announcement['tone']) ?? 'info',
    title: str(raw['title']) ?? '',
    body: str(raw['body']) ?? '',
    action: action
      ? {
          type: str(action['type']) as NonNullable<Announcement['action']>['type'],
          label: str(action['label']) ?? '',
          url: str(action['url']),
          route: str(action['route']),
        }
      : null,
    dismissible: raw['dismissible'] !== false,
    notify: raw['notify'] === true,
    repeat: raw['repeat'] === 'until_action' ? 'until_action' : 'once',
    snoozeHours: num(raw['snoozeHours'], 24),
    priority: num(raw['priority'], 50),
    audience: {
      accountIds: stringList(audience['accountIds']),
      notifierIds: stringList(audience['notifierIds']),
      userIds: stringList(audience['userIds']),
      roles: stringList(audience['roles']),
      platforms: stringList(audience['platforms']),
      minVersion: str(audience['minVersion']),
      maxVersion: str(audience['maxVersion']),
      condition,
    },
    startsAt: str(raw['startsAt']),
    endsAt: str(raw['endsAt']),
    source: raw['source'] === 'system' ? 'system' : 'manual',
    systemKey: str(raw['systemKey']),
    createdBy: str(raw['createdBy']),
    publishedAt: str(raw['publishedAt']),
    createdAt: str(raw['createdAt']),
    updatedAt: str(raw['updatedAt']),
    stats: statsOf(raw['stats']),
  };
}

function statsOf(value: unknown): AnnouncementStats | null {
  if (!isRecord(value)) return null;
  return {
    seen: num(value['seen'], 0),
    action: num(value['action'], 0),
    dismissed: num(value['dismissed'], 0),
    notified: num(value['notified'], 0),
  };
}

/**
 * Recibo del backend: `recipientName` (displayName del notificador o email del usuario),
 * `deviceModel`, `email`, `accountName`.
 */
export function normalizeReceipt(raw: Raw): AnnouncementReceipt {
  const platform = str(raw['platform']);
  return {
    id: idOf(raw) || `${str(raw['recipientType']) ?? ''}:${str(raw['recipientId']) ?? ''}`,
    announcementKey: str(raw['announcementKey']) ?? '',
    recipientType: raw['recipientType'] === 'user' ? 'user' : 'notifier',
    recipientId: str(raw['recipientId']) ?? '',
    recipientName: str(raw['recipientName']) ?? str(raw['email']),
    recipientDetail: str(raw['deviceModel']),
    email: str(raw['email']),
    accountId: str(raw['accountId']),
    accountName: str(raw['accountName']),
    appVersion: str(raw['appVersion']),
    platform: platform === 'android' || platform === 'ios' ? platform : null,
    firstSeenAt: str(raw['firstSeenAt']),
    lastSeenAt: str(raw['lastSeenAt']),
    seenCount: num(raw['seenCount'], 0),
    notifiedAt: str(raw['notifiedAt']),
    actionAt: str(raw['actionAt']),
    dismissedAt: str(raw['dismissedAt']),
    dismissCount: num(raw['dismissCount'], 0),
  };
}

export function normalizeRelease(raw: Raw): AppRelease {
  return {
    id: str(raw['id']) ?? str(raw['_id']),
    key: str(raw['key']),
    stats: statsOf(raw['stats']),
    app: raw['app'] === 'yep' ? 'yep' : 'notifier',
    platform: raw['platform'] === 'ios' ? 'ios' : 'android',
    latestVersion: str(raw['latestVersion']) ?? '',
    minSupportedVersion: str(raw['minSupportedVersion']),
    storeUrl: str(raw['storeUrl']) ?? '',
    title: str(raw['title']),
    body: str(raw['body']),
    notify: raw['notify'] !== false,
    enabled: raw['enabled'] !== false,
    updatedAt: str(raw['updatedAt']),
  };
}

function normalizeVersionCount(raw: Raw): NotifierVersionCount {
  return { version: str(raw['version']), count: num(raw['count'], 0) };
}
