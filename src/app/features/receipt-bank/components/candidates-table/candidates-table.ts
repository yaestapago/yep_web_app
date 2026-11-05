import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideEye } from '@lucide/angular';
import { finalize } from 'rxjs';

import type { DashboardDateRange } from '../../../../shared/models/dashboard-summary.models';
import type {
  ReceiptCandidate,
  ReceiptCandidatesQuery,
  ReceiptFallbackReason,
} from '../../../../shared/models/receipt-bank.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import {
  DateRangePicker,
  type DateRangePreset,
  rangeForPreset,
} from '../../../../shared/ui/date-range-picker/date-range-picker';
import { IconButton } from '../../../../shared/ui/icon-button/icon-button';
import { Input } from '../../../../shared/ui/input/input';
import { Modal } from '../../../../shared/ui/modal/modal';
import { Select, type SelectOption } from '../../../../shared/ui/select/select';
import { State } from '../../../../shared/ui/state/state';
import { StatusChip } from '../../../../shared/ui/status-chip/status-chip';
import { Table } from '../../../../shared/ui/table/table';
import { Toggle } from '../../../../shared/ui/toggle/toggle';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { ReceiptBankApiService } from '../../services/receipt-bank-api.service';
import { FALLBACK_REASON_LABELS, FALLBACK_REASON_OPTIONS } from '../../utils/receipt-bank.util';
import { ReceiptFilePreview } from '../receipt-file-preview/receipt-file-preview';

/**
 * Comprobantes de clientes. La lista es de solo lectura y sin valores: monto, nombres y cuentas no
 * llegan aquí. Escoger uno crea un borrador; nada entra solo, porque un admin debe llenar sus datos
 * y confirmarlo. Cada consulta deja bitácora, así que la lista no se recarga mientras se escribe.
 */
@Component({
  selector: 'app-candidates-table',
  imports: [
    DatePipe,
    FormsModule,
    Alert,
    Button,
    DateRangePicker,
    IconButton,
    Input,
    Modal,
    ReceiptFilePreview,
    Select,
    State,
    StatusChip,
    Table,
    Toggle,
  ],
  templateUrl: './candidates-table.html',
  styleUrl: './candidates-table.scss',
})
export class CandidatesTable implements OnInit {
  private readonly api = inject(ReceiptBankApiService);
  private readonly destroyRef = inject(DestroyRef);

  /** Se escogió un comprobante: hay que abrir su borrador. */
  readonly exampleChosen = output<{ exampleId: string; alreadySelected: boolean }>();

  readonly eyeIcon = LucideEye;
  readonly reasonOptions = FALLBACK_REASON_OPTIONS;

  readonly candidates = signal<ReceiptCandidate[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly choosingId = signal<string | null>(null);

  // Filtros
  readonly range = signal<DashboardDateRange>(rangeForPreset('30d'));
  readonly preset = signal<DateRangePreset>('30d');
  readonly accountId = signal('');
  readonly issuerHint = signal('');
  readonly fallbackReason = signal('');
  readonly onlyUnselected = signal(false);
  /** Negocios vistos en lo que ya se cargó: no hay un buscador de negocios para superadmin. */
  private readonly seenAccounts = signal<ReadonlyMap<string, string>>(new Map());

  readonly accountOptions = computed<SelectOption[]>(() =>
    [...this.seenAccounts()].map(([id, label]) => ({ id, label })),
  );

  /** La pista de banco no admite dígitos: las consultas quedan en los logs HTTP. */
  readonly issuerHintError = computed(() =>
    /\d/.test(this.issuerHint()) ? 'Escribe solo el nombre del banco, sin números.' : '',
  );

  // Ver el archivo
  readonly viewing = signal<ReceiptCandidate | null>(null);
  readonly viewUrl = signal<string | null>(null);
  readonly viewLoading = signal(false);
  readonly viewError = signal('');

  ngOnInit(): void {
    this.search();
  }

  private query(cursor?: string): ReceiptCandidatesQuery {
    const hint = this.issuerHint().trim();
    return {
      from: this.range().from,
      to: this.range().to,
      accountId: this.accountId() || undefined,
      issuerHint: hint || undefined,
      fallbackReason: (this.fallbackReason() || undefined) as ReceiptFallbackReason | undefined,
      onlyUnselected: this.onlyUnselected() || undefined,
      cursor,
    };
  }

  search(): void {
    if (this.issuerHintError()) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .listCandidates(this.query())
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          this.candidates.set(page.candidates);
          this.nextCursor.set(page.nextCursor);
          this.rememberAccounts(page.candidates);
        },
        error: (error) => this.error.set(httpErrorMessage(error)),
      });
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore() || this.issuerHintError()) return;
    this.loadingMore.set(true);
    this.actionError.set('');
    this.api
      .listCandidates(this.query(cursor))
      .pipe(
        finalize(() => this.loadingMore.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          this.candidates.update((current) => [...current, ...page.candidates]);
          this.nextCursor.set(page.nextCursor);
          this.rememberAccounts(page.candidates);
        },
        error: (error) => this.actionError.set(httpErrorMessage(error)),
      });
  }

  private rememberAccounts(candidates: ReceiptCandidate[]): void {
    const accounts = new Map(this.seenAccounts());
    for (const candidate of candidates) {
      accounts.set(candidate.accountId, candidate.accountName || 'Negocio sin nombre');
    }
    this.seenAccounts.set(accounts);
  }

  onRangeChange(event: { range: DashboardDateRange; preset: DateRangePreset }): void {
    this.range.set(event.range);
    this.preset.set(event.preset);
  }

  methodLabel(candidate: ReceiptCandidate): string {
    if (candidate.method === 'rules') return 'Reglas';
    return candidate.method === 'ai' ? 'IA' : 'Sin dato';
  }

  reasonLabel(candidate: ReceiptCandidate): string {
    const reason = candidate.fallbackReason;
    if (!reason) return '—';
    return FALLBACK_REASON_LABELS[reason as ReceiptFallbackReason] ?? reason;
  }

  view(candidate: ReceiptCandidate): void {
    this.viewing.set(candidate);
    this.loadViewUrl(candidate);
  }

  loadViewUrl(candidate: ReceiptCandidate): void {
    this.viewUrl.set(null);
    this.viewError.set('');
    this.viewLoading.set(true);
    this.api
      .candidateFileUrl(candidate.paymentSupportId)
      .pipe(
        finalize(() => this.viewLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ url }) => {
          if (this.viewing() === candidate) this.viewUrl.set(url);
        },
        error: (error) => this.viewError.set(httpErrorMessage(error)),
      });
  }

  closeView(): void {
    this.viewing.set(null);
    this.viewUrl.set(null);
  }

  /** Crea el borrador. Repetirlo con el mismo comprobante devuelve el mismo borrador. */
  choose(candidate: ReceiptCandidate): void {
    if (this.choosingId()) return;
    this.choosingId.set(candidate.paymentSupportId);
    this.actionError.set('');
    this.api
      .selectCandidate(candidate.paymentSupportId)
      .pipe(
        finalize(() => this.choosingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ example, alreadySelected }) => {
          this.candidates.update((current) =>
            current.map((item) =>
              item.paymentSupportId === candidate.paymentSupportId
                ? { ...item, alreadySelected: true }
                : item,
            ),
          );
          this.closeView();
          this.exampleChosen.emit({ exampleId: example.id, alreadySelected });
        },
        error: (error) => this.actionError.set(httpErrorMessage(error)),
      });
  }
}
