import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideArchive,
  LucideArrowLeft,
  LucideCopy,
  LucidePencil,
  LucideRefreshCw,
  LucideSend,
  LucideTrash2,
  LucideUndo2,
} from '@lucide/angular';
import { finalize } from 'rxjs';

import {
  Alert,
  Button,
  Card,
  DescriptionItem,
  DescriptionList,
  Kpi,
  Menu,
  MenuItem,
  PageHeader,
  Pagination,
  State,
  StatusChip,
  Table,
} from '../../../../shared/ui';
import { formatDateTime } from '../../../../shared/utils/billing-format';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AnnouncementPreview } from '../../components/announcement-preview/announcement-preview';
import type {
  Announcement,
  AnnouncementReceipt,
  AnnouncementStatus,
} from '../../models/announcement.models';
import { AdminAnnouncementsApiService } from '../../services/admin-announcements-api.service';
import { AnnouncementCommandsService } from '../../services/announcement-commands.service';
import {
  ACTION_LABELS,
  APP_LABELS,
  PLATFORM_LABELS,
  REPEAT_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  TONE_LABELS,
  audienceSummary,
  dismissLabelFor,
  formatCompactDateTime,
  formatCount,
  sourceLabel,
  statusNote,
  windowLabel,
} from '../../utils/announcement-labels';
import { takeNavigationNotice } from '../../utils/navigation-notice';

export const RECEIPTS_PAGE_SIZE = 50;

export interface ReceiptRowView {
  receipt: AnnouncementReceipt;
  name: string;
  detail: string;
  account: string;
  version: string;
  platform: string;
  seen: string;
  seenCount: string;
  notified: string;
  action: string;
  dismissed: string;
  dismissCount: string;
}

export function toReceiptRow(receipt: AnnouncementReceipt, now: Date = new Date()): ReceiptRowView {
  const fallbackName = receipt.recipientType === 'notifier' ? 'Celular sin nombre' : 'Usuario';
  const at = (value: string | null) => formatCompactDateTime(value, now) || '—';
  return {
    receipt,
    name: receipt.recipientName || fallbackName,
    detail: receipt.recipientDetail ?? '',
    account: receipt.accountName ?? '—',
    version: receipt.appVersion || '—',
    platform: receipt.platform ? PLATFORM_LABELS[receipt.platform] : '',
    seen: at(receipt.lastSeenAt ?? receipt.firstSeenAt),
    seenCount:
      receipt.seenCount > 1
        ? `${formatCount(receipt.seenCount)} veces · primera ${formatCompactDateTime(receipt.firstSeenAt, now)}`
        : '',
    notified: at(receipt.notifiedAt),
    action: at(receipt.actionAt),
    dismissed: at(receipt.dismissedAt),
    dismissCount:
      receipt.dismissedAt && receipt.dismissCount > 1
        ? `${formatCount(receipt.dismissCount)} veces`
        : '',
  };
}

/** Superadmin · detalle de un anuncio: estadísticas y quién lo vio, tocó o cerró. */
@Component({
  selector: 'app-announcement-detail-page',
  imports: [
    Alert,
    Button,
    Card,
    DescriptionItem,
    DescriptionList,
    Kpi,
    Menu,
    MenuItem,
    PageHeader,
    Pagination,
    State,
    StatusChip,
    Table,
    AnnouncementPreview,
    LucideArchive,
    LucideArrowLeft,
    LucideCopy,
    LucidePencil,
    LucideRefreshCw,
    LucideSend,
    LucideTrash2,
    LucideUndo2,
  ],
  templateUrl: './announcement-detail.page.html',
  styleUrl: './announcement-detail.page.scss',
})
export class AnnouncementDetailPage implements OnInit {
  private readonly api = inject(AdminAnnouncementsApiService);
  private readonly commands = inject(AnnouncementCommandsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly appLabels = APP_LABELS;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly statusTones = STATUS_TONES;
  protected readonly toneLabels = TONE_LABELS;
  protected readonly actionLabels = ACTION_LABELS;
  protected readonly repeatLabels = REPEAT_LABELS;
  protected readonly formatCount = formatCount;
  protected readonly formatDateTime = formatDateTime;
  protected readonly canDelete = AnnouncementCommandsService.canDelete;

  readonly id = signal('');
  readonly announcement = signal<Announcement | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly acting = signal(false);

  readonly receipts = signal<AnnouncementReceipt[]>([]);
  readonly receiptsTotal = signal<number | null>(null);
  readonly receiptsPage = signal(1);
  readonly receiptsLoading = signal(false);
  readonly receiptsError = signal('');

  readonly receiptRows = computed(() => this.receipts().map((receipt) => toReceiptRow(receipt)));
  readonly pageCount = computed(() => {
    const total = this.receiptsTotal();
    if (total !== null) return Math.max(1, Math.ceil(total / RECEIPTS_PAGE_SIZE));
    // Sin total: hay otra página si esta vino llena.
    const full = this.receipts().length === RECEIPTS_PAGE_SIZE;
    return this.receiptsPage() + (full ? 1 : 0);
  });
  readonly isNotifier = computed(() => this.announcement()?.app === 'notifier');
  readonly audience = computed(() => {
    const item = this.announcement();
    return item ? audienceSummary(item.app, item.audience) : '';
  });
  readonly note = computed(() => {
    const item = this.announcement();
    return item ? statusNote(item) : '';
  });

  ngOnInit(): void {
    this.notice.set(takeNavigationNotice());
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.id.set(params.get('id') ?? '');
      this.receiptsPage.set(1);
      this.load();
    });
  }

  load(): void {
    const id = this.id();
    if (!id) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .get(id)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (announcement) => this.announcement.set(announcement),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
    this.loadReceipts();
  }

  loadReceipts(): void {
    const id = this.id();
    if (!id) return;
    this.receiptsLoading.set(true);
    this.receiptsError.set('');
    this.api
      .receipts(id, {
        limit: RECEIPTS_PAGE_SIZE,
        skip: (this.receiptsPage() - 1) * RECEIPTS_PAGE_SIZE,
      })
      .pipe(
        finalize(() => this.receiptsLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          this.receipts.set(page.receipts);
          this.receiptsTotal.set(page.total);
        },
        error: (error) => this.receiptsError.set(httpErrorMessage(error)),
      });
  }

  goToPage(page: number): void {
    this.receiptsPage.set(page);
    this.loadReceipts();
  }

  back(): void {
    void this.router.navigate(['/__ops/announcements']);
  }

  edit(): void {
    void this.router.navigate(['/__ops/announcements', this.id(), 'edit']);
  }

  duplicate(): void {
    void this.router.navigate(['/__ops/announcements/new'], {
      queryParams: { duplicar: this.id() },
    });
  }

  dismissLabel(item: Announcement): string {
    return dismissLabelFor(item.repeat);
  }

  sourceLabel(item: Announcement): string {
    return sourceLabel(item);
  }

  windowLabel(item: Announcement): string {
    return windowLabel(item);
  }

  async changeStatus(status: AnnouncementStatus): Promise<void> {
    const item = this.announcement();
    if (!item) return;
    this.acting.set(true);
    const result = await this.commands.changeStatus(item, status);
    this.acting.set(false);
    if (result.kind === 'error') {
      this.notice.set('');
      this.error.set(result.message);
    } else if (result.kind === 'updated') {
      this.error.set('');
      this.announcement.set(result.announcement);
      this.notice.set(result.message);
      this.load();
    }
  }

  async remove(): Promise<void> {
    const item = this.announcement();
    if (!item) return;
    this.acting.set(true);
    const result = await this.commands.remove(item);
    this.acting.set(false);
    if (result.kind === 'error') this.error.set(result.message);
    if (result.kind === 'updated') {
      // El backend lo archivó en vez de borrarlo.
      this.announcement.set(result.announcement);
      this.notice.set(result.message);
    }
    if (result.kind === 'deleted') {
      void this.router.navigate(['/__ops/announcements'], { state: { notice: result.message } });
    }
  }
}
