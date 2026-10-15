import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArchive,
  LucideCopy,
  LucidePlus,
  LucideRefreshCw,
  LucideSend,
  LucideTrash2,
  LucideUndo2,
} from '@lucide/angular';
import { finalize } from 'rxjs';

import {
  Alert,
  ButtonLink,
  Button,
  Card,
  IconButton,
  Menu,
  MenuItem,
  PageHeader,
  Segmented,
  type SegmentedOption,
  State,
  StatusChip,
  Table,
} from '../../../../shared/ui';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AppReleasesPanel } from '../../components/app-releases-panel/app-releases-panel';
import type {
  Announcement,
  AnnouncementApp,
  AnnouncementStatus,
} from '../../models/announcement.models';
import { AdminAnnouncementsApiService } from '../../services/admin-announcements-api.service';
import { AnnouncementCommandsService } from '../../services/announcement-commands.service';
import {
  APP_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  TONE_CHIP,
  TONE_LABELS,
  audienceSummary,
  formatCount,
  statusNote,
  windowLabel,
} from '../../utils/announcement-labels';
import { takeNavigationNotice } from '../../utils/navigation-notice';

type AppFilter = 'all' | AnnouncementApp;
type StatusFilter = 'all' | AnnouncementStatus;
type Tab = 'announcements' | 'versions';

const TAB_OPTIONS: SegmentedOption[] = [
  { value: 'announcements', label: 'Anuncios' },
  { value: 'versions', label: 'Versiones de las apps' },
];

const APP_OPTIONS: SegmentedOption[] = [
  { value: 'all', label: 'Todas las apps' },
  { value: 'notifier', label: APP_LABELS.notifier },
  { value: 'yep', label: APP_LABELS.yep },
];

const STATUS_OPTIONS: SegmentedOption[] = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: 'Publicados' },
  { value: 'draft', label: 'Borradores' },
  { value: 'archived', label: 'Archivados' },
];

export interface AnnouncementRowView {
  announcement: Announcement;
  appLabel: string;
  statusLabel: string;
  statusNote: string;
  audience: string;
  window: string;
  seen: string;
  action: string;
  dismissed: string;
  /** `—` para la App de YEP (no notifica en v1). */
  notified: string;
}

export function toAnnouncementRow(
  announcement: Announcement,
  now = new Date(),
): AnnouncementRowView {
  const stats = announcement.stats;
  return {
    announcement,
    appLabel: APP_LABELS[announcement.app],
    statusLabel: STATUS_LABELS[announcement.status],
    statusNote: statusNote(announcement, now),
    audience: audienceSummary(announcement.app, announcement.audience),
    window: windowLabel(announcement),
    seen: formatCount(stats?.seen),
    action: formatCount(stats?.action),
    dismissed: formatCount(stats?.dismissed),
    notified: announcement.app === 'notifier' ? formatCount(stats?.notified) : '—',
  };
}

/**
 * Superadmin · `/__ops/announcements`: anuncios del Notificador y de la App de YEP, y
 * las versiones de las apps (pestaña «Versiones de las apps», `?vista=versiones`).
 */
@Component({
  selector: 'app-announcements-admin-page',
  imports: [
    RouterLink,
    Alert,
    Button,
    ButtonLink,
    Card,
    IconButton,
    Menu,
    MenuItem,
    PageHeader,
    Segmented,
    State,
    StatusChip,
    Table,
    AppReleasesPanel,
    LucideArchive,
    LucideCopy,
    LucidePlus,
    LucideRefreshCw,
    LucideSend,
    LucideTrash2,
    LucideUndo2,
  ],
  templateUrl: './announcements-admin.page.html',
  styleUrl: './announcements-admin.page.scss',
})
export class AnnouncementsAdminPage implements OnInit {
  private readonly api = inject(AdminAnnouncementsApiService);
  private readonly commands = inject(AnnouncementCommandsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tabOptions = TAB_OPTIONS;
  protected readonly appOptions = APP_OPTIONS;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly statusTones = STATUS_TONES;
  protected readonly toneChip = TONE_CHIP;
  protected readonly toneLabels = TONE_LABELS;
  protected readonly canDelete = AnnouncementCommandsService.canDelete;

  readonly tab = signal<Tab>('announcements');
  readonly appFilter = signal<AppFilter>('all');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly announcements = signal<Announcement[] | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly actingId = signal<string | null>(null);

  readonly rows = computed(() =>
    (this.announcements() ?? []).map((item) => toAnnouncementRow(item)),
  );
  readonly hasFilters = computed(() => this.appFilter() !== 'all' || this.statusFilter() !== 'all');

  ngOnInit(): void {
    this.notice.set(takeNavigationNotice());
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.tab.set(params.get('vista') === 'versiones' ? 'versions' : 'announcements');
    });
    this.load();
  }

  setTab(value: string): void {
    const tab: Tab = value === 'versions' ? 'versions' : 'announcements';
    this.tab.set(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { vista: tab === 'versions' ? 'versiones' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  setAppFilter(value: string): void {
    this.appFilter.set(value as AppFilter);
    this.load();
  }

  setStatusFilter(value: string): void {
    this.statusFilter.set(value as StatusFilter);
    this.load();
  }

  clearFilters(): void {
    this.appFilter.set('all');
    this.statusFilter.set('all');
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const app = this.appFilter();
    const status = this.statusFilter();
    this.api
      .list({ app: app === 'all' ? null : app, status: status === 'all' ? null : status })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (items) => this.announcements.set(items),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  open(announcement: Announcement): void {
    void this.router.navigate(['/__ops/announcements', announcement.id]);
  }

  edit(announcement: Announcement): void {
    void this.router.navigate(['/__ops/announcements', announcement.id, 'edit']);
  }

  duplicate(announcement: Announcement): void {
    void this.router.navigate(['/__ops/announcements/new'], {
      queryParams: { duplicar: announcement.id },
    });
  }

  async changeStatus(announcement: Announcement, status: AnnouncementStatus): Promise<void> {
    this.actingId.set(announcement.id);
    const result = await this.commands.changeStatus(announcement, status);
    this.actingId.set(null);
    this.applyResult(result);
  }

  async remove(announcement: Announcement): Promise<void> {
    this.actingId.set(announcement.id);
    const result = await this.commands.remove(announcement);
    this.actingId.set(null);
    this.applyResult(result);
  }

  private applyResult(result: Awaited<ReturnType<AnnouncementCommandsService['remove']>>): void {
    if (result.kind === 'cancelled') return;
    if (result.kind === 'error') {
      this.notice.set('');
      this.error.set(result.message);
      return;
    }
    this.error.set('');
    this.notice.set(result.message);
    this.load();
  }
}
