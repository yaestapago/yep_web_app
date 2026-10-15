import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, finalize } from 'rxjs';

import { Button, Pagination, State, Table } from '../../../../shared/ui';
import type { AnnouncementApp, AnnouncementReceipt } from '../../models/announcement.models';
import { AdminAnnouncementsApiService } from '../../services/admin-announcements-api.service';
import {
  PLATFORM_LABELS,
  formatCompactDateTime,
  formatCount,
} from '../../utils/announcement-labels';
import { httpErrorMessages } from '../../utils/http-error-messages';

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

/**
 * Tabla «Quién lo vio» de un anuncio: una fila por celular o usuario, paginada de 50 en
 * 50 (`GET /admin/announcements/:key/receipts`). La `key` es el id de un anuncio manual o
 * automático, o la del aviso de actualizar (`update:<app>:<platform>:<versión>`).
 */
@Component({
  selector: 'app-announcement-receipts',
  imports: [Button, Pagination, State, Table],
  templateUrl: './announcement-receipts.html',
  styleUrl: './announcement-receipts.scss',
})
export class AnnouncementReceipts {
  private readonly api = inject(AdminAnnouncementsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly announcementKey = input.required<string>();
  readonly app = input<AnnouncementApp>('notifier');
  /** Texto del estado vacío. */
  readonly emptyDescription = input('Cuando un celular lo muestre, aparece aquí.');

  readonly receipts = signal<AnnouncementReceipt[]>([]);
  readonly total = signal<number | null>(null);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly isNotifier = computed(() => this.app() === 'notifier');
  readonly columns = computed(() => (this.isNotifier() ? 7 : 6));
  readonly rows = computed(() => this.receipts().map((receipt) => toReceiptRow(receipt)));
  readonly pageCount = computed(() => {
    const total = this.total();
    if (total !== null) return Math.max(1, Math.ceil(total / RECEIPTS_PAGE_SIZE));
    // Sin total: hay otra página si esta vino llena.
    const full = this.receipts().length === RECEIPTS_PAGE_SIZE;
    return this.page() + (full ? 1 : 0);
  });

  private request: Subscription | null = null;

  constructor() {
    // Al cambiar de anuncio se vuelve a la primera página.
    effect(() => {
      const key = this.announcementKey();
      untracked(() => {
        this.page.set(1);
        this.receipts.set([]);
        this.total.set(null);
        if (key) this.reload();
      });
    });
  }

  reload(): void {
    const key = this.announcementKey();
    if (!key) return;
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.request = this.api
      .receipts(key, { limit: RECEIPTS_PAGE_SIZE, skip: (this.page() - 1) * RECEIPTS_PAGE_SIZE })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          this.receipts.set(page.receipts);
          this.total.set(page.total);
        },
        error: (error) => this.error.set(httpErrorMessages(error).join(' ')),
      });
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.reload();
  }
}
