import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input as defineInput,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideCalendarClock } from '@lucide/angular';
import { Subscription, finalize } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { BillingStatusService } from '../../../../core/services/billing-status.service';
import type {
  BillingState,
  BillingStatusInvoiceStatus,
  BillingStatusResponse,
} from '../../../../shared/models/billing-status.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import {
  billingPeriodLabel,
  billingPeriodWord,
  bogotaIsoDate,
  formatBogotaLongDate,
  formatCopAmount,
  formatDaysLeft,
} from '../../../../shared/utils/billing-format';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { AdminBusinessBillingApiService } from '../../../admin-billing/services/admin-business-billing-api.service';

export const CUTOFF_NOTE_MAX_LENGTH = 300;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const STATE_LABELS: Record<BillingState, string> = {
  ok: 'Al día',
  due_soon: 'Por vencer',
  payment_review: 'Pago en revisión',
  blocked: 'Bloqueado',
};

const INVOICE_STATUS_LABELS: Record<BillingStatusInvoiceStatus, string> = {
  issued: 'Pendiente',
  reported: 'Pago reportado',
  paid: 'Pagada',
  cancelled: 'Cancelada',
};

/** `YYYY-MM-DD` → fecha ISO a las 00:00 de Bogotá, solo para mostrarla. */
function bogotaMidnightIso(isoDate: string): string {
  return `${isoDate}T05:00:00.000Z`;
}

/**
 * "Cobro y fecha de corte" en Datos del negocio. Solo superadmin global
 * (`account_su`): para cualquier otro usuario (incluido soporte) no se
 * renderiza ni consulta nada.
 *
 * Mes adelantado: la fecha de corte es el fin de la prueba o del ciclo pagado
 * en curso; para esa fecha la cuenta de cobro del ciclo siguiente (emitida 5
 * días antes) ya debe estar paga.
 */
@Component({
  selector: 'app-billing-cutoff-card',
  imports: [FormsModule, Alert, Button, LucideCalendarClock],
  templateUrl: './billing-cutoff-card.html',
  styleUrl: './billing-cutoff-card.scss',
})
export class BillingCutoffCard {
  private readonly api = inject(AdminBusinessBillingApiService);
  private readonly session = inject(AuthSessionService);
  private readonly billing = inject(BillingStatusService);
  private readonly destroyRef = inject(DestroyRef);

  readonly businessId = defineInput<string | null>(null);

  readonly noteMaxLength = CUTOFF_NOTE_MAX_LENGTH;
  /** Solo superadmin; soporte no ve la tarjeta (no puede editar la fecha). */
  readonly visible = computed(() => this.session.isSuperUser() && !!this.businessId());

  readonly status = signal<BillingStatusResponse | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal('');

  /** Hoy en Bogotá (`YYYY-MM-DD`): mínimo del selector de fecha. */
  readonly minDate = signal(bogotaIsoDate());
  readonly cutoffInput = signal('');
  readonly note = signal('');
  readonly confirming = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly saveSuccess = signal('');

  readonly stateLabel = computed(() => {
    const state = this.status()?.state;
    return state ? STATE_LABELS[state] : '';
  });
  readonly periodLabel = computed(() => {
    const status = this.status();
    if (!status) return '';
    if (status.phase === 'trial') return 'Prueba gratis';
    if (status.phase === 'none') return 'Sin plan';
    return billingPeriodLabel(status.billingPeriod);
  });
  readonly pendingPeriodLabel = computed(() => {
    const status = this.status();
    if (!status?.pendingBillingPeriod || !status.pendingBillingPeriodEffectiveAt) return '';
    return `Pasa a ${billingPeriodWord(status.pendingBillingPeriod)} el ${formatBogotaLongDate(
      status.pendingBillingPeriodEffectiveAt,
    )}`;
  });
  readonly cutoffLabel = computed(() => formatBogotaLongDate(this.status()?.cutoffDate));
  readonly cutoffHint = computed(() => {
    const status = this.status();
    if (!status) return '';
    if (status.state === 'blocked') {
      const since = formatBogotaLongDate(status.blockedAt);
      return since ? `Bloqueado desde el ${since}.` : 'El negocio está bloqueado.';
    }
    const days = status.daysLeft;
    const left =
      days === null || days === undefined
        ? ''
        : days < 0
          ? 'Vencida. '
          : days === 0
            ? 'Es hoy. '
            : `Faltan ${formatDaysLeft(days)}. `;
    return status.phase === 'trial'
      ? `${left}Fin de la prueba gratis.`
      : `${left}Fin del ciclo pagado; para esa fecha el siguiente periodo ya debe estar pago.`;
  });
  readonly invoice = computed(() => this.status()?.currentInvoice ?? null);
  readonly invoiceAmount = computed(() => formatCopAmount(this.invoice()?.totalCop));
  readonly invoiceStatusLabel = computed(() => {
    const status = this.invoice()?.status;
    return status ? (INVOICE_STATUS_LABELS[status] ?? status) : '';
  });
  /** Fecha elegida, legible, para el paso de confirmación. */
  readonly selectedDateLabel = computed(() => {
    const value = this.cutoffInput();
    return ISO_DATE_PATTERN.test(value) ? formatBogotaLongDate(bogotaMidnightIso(value)) : '';
  });
  readonly selectedIsToday = computed(() => this.cutoffInput() === this.minDate());

  private loadSub: Subscription | null = null;

  constructor() {
    effect(() => {
      const businessId = this.businessId();
      const visible = this.visible();
      untracked(() => {
        this.resetForm();
        this.status.set(null);
        if (!visible || !businessId) {
          this.cancelLoad();
          return;
        }
        this.load(businessId);
      });
    });
    this.destroyRef.onDestroy(() => this.cancelLoad());
  }

  load(businessId = this.businessId()): void {
    if (!businessId || !this.visible()) return;
    this.cancelLoad();
    this.loading.set(true);
    this.loadError.set('');

    this.loadSub = this.api
      .status(businessId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (status) => {
          if (businessId !== this.businessId()) return;
          this.status.set(status);
          this.cutoffInput.set(this.defaultInputDate(status));
        },
        error: (error) => this.loadError.set(httpErrorMessage(error)),
      });
  }

  /** Primer paso: valida la fecha y muestra la confirmación en la misma tarjeta. */
  requestSave(): void {
    this.saveError.set('');
    this.saveSuccess.set('');
    const value = this.cutoffInput();
    if (!ISO_DATE_PATTERN.test(value)) {
      this.saveError.set('Elige una fecha de corte.');
      return;
    }
    // Recalcula "hoy" por si la pestaña quedó abierta de un día para otro.
    this.minDate.set(bogotaIsoDate());
    if (value < this.minDate()) {
      this.saveError.set('La fecha de corte no puede ser anterior a hoy.');
      return;
    }
    if (this.note().length > CUTOFF_NOTE_MAX_LENGTH) {
      this.saveError.set(`El motivo admite máximo ${CUTOFF_NOTE_MAX_LENGTH} caracteres.`);
      return;
    }
    this.confirming.set(true);
  }

  cancelConfirm(): void {
    if (this.saving()) return;
    this.confirming.set(false);
  }

  confirmSave(): void {
    const businessId = this.businessId();
    const cutoffDate = this.cutoffInput();
    if (!businessId || !this.visible() || this.saving() || !ISO_DATE_PATTERN.test(cutoffDate)) {
      return;
    }
    const note = this.note().trim();

    this.saving.set(true);
    this.saveError.set('');
    this.api
      .adjustCutoff(businessId, { cutoffDate, ...(note ? { note } : {}) })
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.confirming.set(false);
          this.note.set('');
          this.status.update((previous) => (previous ? { ...previous, ...response } : previous));
          this.saveSuccess.set(
            `Fecha de corte actualizada al ${formatBogotaLongDate(response.cutoffDate) || this.selectedDateLabel()}.`,
          );
          this.load(businessId);
          if (businessId === this.session.activeBusinessAccountId()) {
            void this.billing.refresh();
          }
        },
        error: (error) => {
          this.confirming.set(false);
          this.saveError.set(httpErrorMessage(error));
        },
      });
  }

  updateCutoffInput(value: string): void {
    this.cutoffInput.set(value ?? '');
    this.confirming.set(false);
    this.saveError.set('');
  }

  updateNote(value: string): void {
    this.note.set((value ?? '').slice(0, CUTOFF_NOTE_MAX_LENGTH));
  }

  /** La fecha de corte actual (día de Bogotá), o hoy si ya pasó. */
  private defaultInputDate(status: BillingStatusResponse): string {
    const today = bogotaIsoDate();
    const current = status.cutoffDate ? bogotaIsoDate(status.cutoffDate) : '';
    return current && current >= today ? current : today;
  }

  private resetForm(): void {
    this.cutoffInput.set('');
    this.note.set('');
    this.confirming.set(false);
    this.saveError.set('');
    this.saveSuccess.set('');
    this.loadError.set('');
  }

  private cancelLoad(): void {
    this.loadSub?.unsubscribe();
    this.loadSub = null;
    this.loading.set(false);
  }
}
