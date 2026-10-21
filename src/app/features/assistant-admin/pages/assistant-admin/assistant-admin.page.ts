import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideRefreshCw, LucideSearch } from '@lucide/angular';
import { Subscription, finalize } from 'rxjs';

import {
  Alert,
  Button,
  Card,
  Input,
  Kpi,
  Modal,
  PageHeader,
  State,
  StatusChip,
  Table,
} from '../../../../shared/ui';
import { Toggle } from '../../../../shared/ui/toggle/toggle';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import type {
  AssistantConversationDetail,
  AssistantConversationSummary,
  AssistantUsage,
} from '../../models/assistant-admin.models';
import { AssistantAdminApiService } from '../../services/assistant-admin-api.service';
import {
  INCIDENT_LABELS,
  INCIDENT_TONES,
  formatCop,
  formatCount,
  formatDateTime,
  formatMonth,
  toolLabel,
} from '../../utils/assistant-admin-labels';

/** `% del tope` en amarillo desde el 80 % y en rojo al llegar. */
export function budgetTone(percent: number): 'neutral' | 'warning' | 'error' {
  if (percent >= 100) return 'error';
  if (percent >= 80) return 'warning';
  return 'neutral';
}

/**
 * Superadmin · `/__ops/assistant`: lo que los negocios le preguntan a Zaira,
 * cuánto gasta cada uno en el mes y las alertas para revisar.
 */
@Component({
  selector: 'app-assistant-admin-page',
  imports: [
    FormsModule,
    Alert,
    Button,
    Card,
    Input,
    Kpi,
    Modal,
    PageHeader,
    State,
    StatusChip,
    Table,
    Toggle,
    LucideRefreshCw,
    LucideSearch,
  ],
  templateUrl: './assistant-admin.page.html',
  styleUrl: './assistant-admin.page.scss',
})
export class AssistantAdminPage implements OnInit {
  private readonly api = inject(AssistantAdminApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly incidentLabels = INCIDENT_LABELS;
  protected readonly incidentTones = INCIDENT_TONES;
  protected readonly formatCop = formatCop;
  protected readonly formatCount = formatCount;
  protected readonly formatDateTime = formatDateTime;
  protected readonly toolLabel = toolLabel;
  protected readonly budgetTone = budgetTone;

  readonly usage = signal<AssistantUsage | null>(null);
  readonly usageLoading = signal(false);
  readonly usageError = signal('');

  readonly conversations = signal<AssistantConversationSummary[] | null>(null);
  readonly nextCursor = signal<string | null>(null);
  readonly listLoading = signal(false);
  readonly loadingMore = signal(false);
  readonly listError = signal('');
  /** Por defecto solo las que tienen alertas: es lo que hay que revisar. */
  readonly flaggedOnly = signal(true);
  readonly search = signal('');
  private readonly appliedSearch = signal('');

  readonly detail = signal<AssistantConversationDetail | null>(null);
  readonly detailOpen = signal(false);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');
  /** Índices de la transcripción con el resultado de la herramienta abierto. */
  readonly expandedResults = signal<ReadonlySet<number>>(new Set());

  readonly monthLabel = computed(() => {
    const usage = this.usage();
    return usage ? formatMonth(usage.month) : '';
  });
  readonly hasFilters = computed(() => this.flaggedOnly() || !!this.appliedSearch());
  readonly detailSubtitle = computed(() => {
    const detail = this.detail();
    if (!detail) return '';
    return [
      detail.account?.name ?? 'Sin negocio',
      detail.user?.name ?? 'Usuario eliminado',
      `${formatCount(detail.userTurns)} preguntas`,
      formatCop(detail.costCop),
    ].join(' · ');
  });

  private listRequest?: Subscription;
  private detailRequest?: Subscription;

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loadUsage();
    this.loadConversations();
  }

  loadUsage(): void {
    this.usageLoading.set(true);
    this.usageError.set('');
    this.api
      .usage()
      .pipe(
        finalize(() => this.usageLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (usage) => this.usage.set(usage),
        error: (error) => this.usageError.set(httpErrorMessage(error)),
      });
  }

  /** Recarga la lista desde el principio con los filtros actuales. */
  loadConversations(): void {
    this.listRequest?.unsubscribe();
    this.listLoading.set(true);
    this.listError.set('');
    this.listRequest = this.api
      .listConversations({ flagged: this.flaggedOnly(), q: this.appliedSearch() })
      .pipe(
        finalize(() => this.listLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          this.conversations.set(page.conversations);
          this.nextCursor.set(page.nextCursor ?? null);
        },
        error: (error) => this.listError.set(httpErrorMessage(error)),
      });
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.api
      .listConversations({ flagged: this.flaggedOnly(), q: this.appliedSearch(), cursor })
      .pipe(
        finalize(() => this.loadingMore.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          this.conversations.update((current) => [...(current ?? []), ...page.conversations]);
          this.nextCursor.set(page.nextCursor ?? null);
        },
        error: (error) => this.listError.set(httpErrorMessage(error)),
      });
  }

  setFlaggedOnly(value: boolean): void {
    this.flaggedOnly.set(value);
    this.loadConversations();
  }

  applySearch(event?: Event): void {
    event?.preventDefault();
    this.appliedSearch.set(this.search().trim());
    this.loadConversations();
  }

  clearFilters(): void {
    this.flaggedOnly.set(false);
    this.search.set('');
    this.appliedSearch.set('');
    this.loadConversations();
  }

  open(conversation: AssistantConversationSummary): void {
    this.detailRequest?.unsubscribe();
    this.detail.set(null);
    this.detailError.set('');
    this.expandedResults.set(new Set());
    this.detailOpen.set(true);
    this.detailLoading.set(true);
    this.detailRequest = this.api
      .conversation(conversation.id)
      .pipe(
        finalize(() => this.detailLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (detail) => this.detail.set(detail),
        error: (error) => this.detailError.set(httpErrorMessage(error)),
      });
  }

  closeDetail(): void {
    this.detailRequest?.unsubscribe();
    this.detailOpen.set(false);
  }

  toggleResult(index: number): void {
    this.expandedResults.update((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }
}
