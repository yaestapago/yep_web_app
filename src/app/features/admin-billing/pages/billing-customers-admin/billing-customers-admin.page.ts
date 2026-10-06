import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideLoaderCircle, LucideRefreshCw, LucideSearch } from '@lucide/angular';
import { finalize } from 'rxjs';

import type {
  BillingCustomerNotice,
  BillingCustomerRow,
  BillingCustomersResponse,
  BillingNoticeChannelResult,
  BillingNoticeChannelStatus,
  BillingNoticeKind,
  BillingState,
} from '../../../../shared/models/billing-status.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import {
  formatCopAmount,
  formatDateTime,
  formatShortDate,
} from '../../../../shared/utils/billing-format';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AdminBillingCustomersApiService } from '../../services/admin-billing-customers-api.service';

export type BillingCustomerFilter =
  | 'all'
  | 'blocked'
  | 'due_soon'
  | 'payment_review'
  | 'trial'
  | 'ok';

const FILTERS: Array<{ key: BillingCustomerFilter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'blocked', label: 'Bloqueados' },
  { key: 'due_soon', label: 'Por vencer' },
  { key: 'payment_review', label: 'Pago en revisión' },
  { key: 'trial', label: 'En prueba' },
  { key: 'ok', label: 'Al día' },
];

const STATE_LABELS: Record<BillingState, string> = {
  blocked: 'Bloqueado',
  due_soon: 'Por vencer',
  payment_review: 'Pago en revisión',
  ok: 'Al día',
};

const STATE_RANK: Record<BillingState, number> = {
  blocked: 0,
  due_soon: 1,
  payment_review: 2,
  ok: 3,
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  trialing: 'En prueba',
  active: 'Activa',
  past_due: 'Pago vencido',
  suspended: 'Suspendida',
  cancelled: 'Cancelada',
  expired: 'Expirada',
};

const REASON_LABELS: Record<string, string> = {
  trial_ended: 'Prueba terminada',
  payment_overdue: 'Cuenta de cobro vencida',
  subscription_ended: 'Suscripción terminada',
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  issued: 'Pendiente',
  reported: 'Pago reportado',
  paid: 'Pagada',
  cancelled: 'Cancelada',
};

const NOTICE_KINDS: Array<{ kind: BillingNoticeKind; short: string; label: string }> = [
  { kind: 'reminder_5d', short: '5d', label: 'Recordatorio 5 días' },
  { kind: 'reminder_2d', short: '2d', label: 'Recordatorio 2 días' },
  { kind: 'blocked', short: 'Bloqueo', label: 'Aviso de bloqueo' },
  { kind: 'payment_confirmed', short: 'Pago', label: 'Pago confirmado' },
  { kind: 'whatsapp_quota_warning', short: 'Cupo 80%', label: 'Cupo de WhatsApp al 80 %' },
  { kind: 'whatsapp_quota_reached', short: 'Cupo agotado', label: 'Cupo de WhatsApp agotado' },
];

const CHANNEL_SYMBOLS: Record<BillingNoticeChannelStatus, string> = {
  sent: '✓',
  failed: '✗',
  skipped: '–',
};

const CHANNEL_STATUS_LABELS: Record<BillingNoticeChannelStatus, string> = {
  sent: 'enviado',
  failed: 'falló',
  skipped: 'omitido',
};

export interface NoticeChannelMark {
  status: BillingNoticeChannelStatus;
  symbol: string;
}

export interface NoticeChip {
  kind: BillingNoticeKind;
  short: string;
  whatsapp: NoticeChannelMark;
  email: NoticeChannelMark;
  hasFailure: boolean;
  title: string;
}

export interface BillingCustomerView {
  row: BillingCustomerRow;
  stateLabel: string;
  detailLabel: string;
  planDetail: string;
  deadlineLabel: string;
  daysLabel: string;
  daysTone: 'overdue' | 'soon' | 'normal';
  invoiceStatusLabel: string;
  notices: NoticeChip[];
  searchText: string;
}

/** Orden por defecto: bloqueados, por vencer (menos días primero), en revisión, resto. */
export function compareBillingRows(a: BillingCustomerRow, b: BillingCustomerRow): number {
  const rank = (STATE_RANK[a.state] ?? 9) - (STATE_RANK[b.state] ?? 9);
  if (rank !== 0) return rank;

  const aDays = a.daysLeft ?? Number.POSITIVE_INFINITY;
  const bDays = b.daysLeft ?? Number.POSITIVE_INFINITY;
  if (aDays !== bDays) return aDays < bDays ? -1 : 1;

  return a.businessName.localeCompare(b.businessName, 'es');
}

export function matchesBillingFilter(
  row: BillingCustomerRow,
  filter: BillingCustomerFilter,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'trial':
      return row.phase === 'trial';
    case 'ok':
      return row.state === 'ok' && row.phase === 'paid';
    default:
      return row.state === filter;
  }
}

/** Agrega un canal: enviado si alguno salió, fallido si alguno falló, si no omitido. */
function aggregateChannel(results: BillingNoticeChannelResult[]): NoticeChannelMark {
  const status: BillingNoticeChannelStatus = results.some((r) => r.status === 'sent')
    ? 'sent'
    : results.some((r) => r.status === 'failed')
      ? 'failed'
      : 'skipped';
  return { status, symbol: CHANNEL_SYMBOLS[status] };
}

function channelLine(name: string, result: BillingNoticeChannelResult): string {
  const label = CHANNEL_STATUS_LABELS[result.status] ?? result.status;
  return result.reason ? `${name}: ${label} (${result.reason})` : `${name}: ${label}`;
}

/** Un chip por tipo de aviso; el `title` detalla cada envío (fecha, destinatario, motivo). */
export function buildNoticeChips(notices: BillingCustomerNotice[]): NoticeChip[] {
  return NOTICE_KINDS.flatMap(({ kind, short, label }) => {
    const ofKind = notices
      .filter((notice) => notice.kind === kind)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    if (ofKind.length === 0) return [];

    const whatsapp = aggregateChannel(ofKind.map((notice) => notice.whatsapp));
    const email = aggregateChannel(ofKind.map((notice) => notice.email));
    const title = [
      label,
      ...ofKind.map((notice) =>
        [
          `${formatDateTime(notice.createdAt)} · ${notice.recipientName || 'Sin destinatario'}`,
          `  ${channelLine('WhatsApp', notice.whatsapp)}`,
          `  ${channelLine('Correo', notice.email)}`,
        ].join('\n'),
      ),
    ].join('\n');

    return [
      {
        kind,
        short,
        whatsapp,
        email,
        hasFailure: whatsapp.status === 'failed' || email.status === 'failed',
        title,
      },
    ];
  });
}

function daysInfo(row: BillingCustomerRow): Pick<BillingCustomerView, 'daysLabel' | 'daysTone'> {
  if (row.state === 'blocked') {
    const since = formatShortDate(row.blockedAt);
    return { daysLabel: since ? `Bloqueado desde ${since}` : 'Bloqueado', daysTone: 'overdue' };
  }
  const days = row.daysLeft;
  if (days === null || days === undefined) {
    return { daysLabel: '', daysTone: 'normal' };
  }
  if (days < 0) {
    const overdue = Math.abs(days);
    return {
      daysLabel: overdue === 1 ? 'Vencida hace 1 día' : `Vencida hace ${overdue} días`,
      daysTone: 'overdue',
    };
  }
  const tone = row.state === 'due_soon' || days <= 5 ? 'soon' : 'normal';
  if (days === 0) return { daysLabel: 'Vence hoy', daysTone: tone };
  return { daysLabel: days === 1 ? 'Falta 1 día' : `Faltan ${days} días`, daysTone: tone };
}

export function toBillingCustomerView(row: BillingCustomerRow): BillingCustomerView {
  const phaseLabel = row.phase === 'trial' ? 'Prueba' : row.phase === 'paid' ? 'Pago' : 'Sin plan';
  const statusLabel = SUBSCRIPTION_STATUS_LABELS[row.status] ?? row.status;
  const reasonLabel = row.reason ? (REASON_LABELS[row.reason] ?? row.reason) : '';
  const period = row.billingPeriod === 'annual' ? 'Anual' : 'Mensual';

  return {
    row,
    stateLabel:
      row.state === 'ok' && row.phase === 'trial' ? 'En prueba' : STATE_LABELS[row.state],
    detailLabel: [phaseLabel, statusLabel, reasonLabel].filter(Boolean).join(' · '),
    planDetail:
      row.contractedPriceCop > 0
        ? `${period} · ${formatCopAmount(row.contractedPriceCop)}`
        : row.phase === 'trial'
          ? 'Prueba gratis'
          : 'Sin costo',
    deadlineLabel: formatShortDate(row.deadline),
    ...daysInfo(row),
    invoiceStatusLabel: row.currentInvoice
      ? (INVOICE_STATUS_LABELS[row.currentInvoice.status] ?? row.currentInvoice.status)
      : '',
    notices: buildNoticeChips(row.notices ?? []),
    searchText: [
      row.businessName,
      ...(row.owners ?? []).flatMap((owner) => [owner.name, owner.email, owner.phone]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('es'),
  };
}

@Component({
  selector: 'app-billing-customers-admin-page',
  imports: [FormsModule, RouterLink, Alert, Button, LucideLoaderCircle, LucideRefreshCw, LucideSearch],
  templateUrl: './billing-customers-admin.page.html',
  styleUrl: './billing-customers-admin.page.scss',
})
export class BillingCustomersAdminPage implements OnInit {
  private readonly api = inject(AdminBillingCustomersApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly filters = FILTERS;
  readonly response = signal<BillingCustomersResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly search = signal('');
  readonly filter = signal<BillingCustomerFilter>('all');

  readonly generatedAtLabel = computed(() => formatDateTime(this.response()?.generatedAt));

  readonly kpis = computed(() => {
    const totals = this.response()?.totals;
    return [
      { key: 'total', label: 'Total', value: totals?.total ?? 0, tone: 'neutral' },
      { key: 'trial', label: 'En prueba', value: totals?.trial ?? 0, tone: 'neutral' },
      { key: 'due_soon', label: 'Por vencer', value: totals?.dueSoon ?? 0, tone: 'warning' },
      {
        key: 'payment_review',
        label: 'Pago en revisión',
        value: totals?.paymentReview ?? 0,
        tone: 'info',
      },
      { key: 'blocked', label: 'Bloqueados', value: totals?.blocked ?? 0, tone: 'error' },
      { key: 'ok', label: 'Al día', value: totals?.active ?? 0, tone: 'success' },
    ];
  });

  private readonly views = computed(() =>
    [...(this.response()?.rows ?? [])].sort(compareBillingRows).map(toBillingCustomerView),
  );

  readonly filterCounts = computed(() => {
    const rows = this.views().map((view) => view.row);
    return Object.fromEntries(
      FILTERS.map(({ key }) => [key, rows.filter((row) => matchesBillingFilter(row, key)).length]),
    ) as Record<BillingCustomerFilter, number>;
  });

  readonly visibleRows = computed(() => {
    const filter = this.filter();
    const query = this.search().trim().toLocaleLowerCase('es');
    return this.views().filter(
      (view) =>
        matchesBillingFilter(view.row, filter) && (!query || view.searchText.includes(query)),
    );
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .list()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.response.set(response),
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  clearFilters(): void {
    this.search.set('');
    this.filter.set('all');
  }

  formatCop(value: number): string {
    return formatCopAmount(value);
  }
}
