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
  AssistantConversationQuery,
  AssistantConversationSummary,
  AssistantUsage,
} from '../../models/assistant-admin.models';
import { AssistantAdminApiService } from '../../services/assistant-admin-api.service';
import {
  INCIDENT_LABELS,
  INCIDENT_TONES,
  TURN_OUTCOME_LABELS,
  TURN_OUTCOME_TONES,
  formatCop,
  formatCount,
  formatDateTime,
  formatLatency,
  formatMonth,
  formatTurnTools,
  toolLabel,
} from '../../utils/assistant-admin-labels';

/** Texto del sistema que se muestra de una vez; uno más largo (una guía) arranca plegado. */
const SYSTEM_TEXT_INLINE_MAX = 120;

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
  protected readonly turnOutcomeLabels = TURN_OUTCOME_LABELS;
  protected readonly turnOutcomeTones = TURN_OUTCOME_TONES;
  protected readonly formatLatency = formatLatency;
  protected readonly formatTurnTools = formatTurnTools;
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
  /** Va aparte de las alertas: una conversación mal calificada puede no tener ninguna. */
  readonly badFeedbackOnly = signal(false);
  readonly search = signal('');
  private readonly appliedSearch = signal('');

  readonly detail = signal<AssistantConversationDetail | null>(null);
  readonly detailOpen = signal(false);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');
  /** Índices de la transcripción con su texto largo abierto (herramienta o sistema). */
  readonly expandedResults = signal<ReadonlySet<number>>(new Set());

  readonly monthLabel = computed(() => {
    const usage = this.usage();
    return usage ? formatMonth(usage.month) : '';
  });
  readonly hasFilters = computed(
    () => this.flaggedOnly() || this.badFeedbackOnly() || !!this.appliedSearch(),
  );
  readonly emptyDescription = computed(() => {
    if (this.badFeedbackOnly()) {
      return 'Ninguna conversación tiene respuestas mal calificadas. Apaga «Solo mal calificadas» para verlas todas.';
    }
    return this.flaggedOnly()
      ? 'Ninguna conversación tiene alertas. Apaga «Solo con alertas» para verlas todas.'
      : '';
  });
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
  private moreRequest?: Subscription;
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
    // Una página en camino es de los filtros anteriores: no se puede sumar a la lista nueva.
    this.moreRequest?.unsubscribe();
    this.listLoading.set(true);
    this.listError.set('');
    this.listRequest = this.api
      .listConversations(this.listQuery())
      .pipe(
        finalize(() => this.listLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          this.conversations.set(page.conversations);
          this.nextCursor.set(page.nextCursor ?? null);
        },
        error: (error) => {
          // El cursor es de la lista anterior: con los filtros nuevos saltaría a cualquier parte.
          this.nextCursor.set(null);
          this.listError.set(httpErrorMessage(error));
        },
      });
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    // Mientras carga la lista, el cursor todavía es de los filtros anteriores.
    if (!cursor || this.loadingMore() || this.listLoading()) return;
    this.loadingMore.set(true);
    this.moreRequest = this.api
      .listConversations({ ...this.listQuery(), cursor })
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
    if (value) this.badFeedbackOnly.set(false);
    this.loadConversations();
  }

  /** Encendido apaga "Solo con alertas": si no, escondería las mal calificadas sin alertas. */
  setBadFeedbackOnly(value: boolean): void {
    this.badFeedbackOnly.set(value);
    if (value) this.flaggedOnly.set(false);
    this.loadConversations();
  }

  applySearch(event?: Event): void {
    event?.preventDefault();
    this.appliedSearch.set(this.search().trim());
    this.loadConversations();
  }

  clearFilters(): void {
    this.flaggedOnly.set(false);
    this.badFeedbackOnly.set(false);
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

  isShortSystemText(text: string): boolean {
    return text.length <= SYSTEM_TEXT_INLINE_MAX;
  }

  toggleResult(index: number): void {
    this.expandedResults.update((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  private listQuery(): AssistantConversationQuery {
    return {
      flagged: this.flaggedOnly(),
      q: this.appliedSearch(),
      ...(this.badFeedbackOnly() ? { feedback: 'down' as const } : {}),
    };
  }
}
