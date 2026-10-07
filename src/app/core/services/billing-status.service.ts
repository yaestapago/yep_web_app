import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
  BillingStatusResponse,
  BusinessBillingBlockedError,
} from '../../shared/models/billing-status.models';
import { AuthSessionService } from './auth-session.service';

/** Tras un fallo de la API, los guards no reintentan antes de este tiempo. */
const FAILURE_RETRY_MS = 60_000;

/**
 * Store (signals) del estado de cobro del negocio activo.
 *
 * - Se carga solo al cambiar de negocio activo (o al iniciar/cerrar sesión).
 * - El interceptor de 402 lo marca como bloqueado sin esperar a la API, para
 *   que el guard, el SSE y el botón "Validar pago" reaccionen de inmediato.
 * - Los roles globales (`account_su`, `support`) nunca se consideran
 *   bloqueados: el backend tampoco los bloquea.
 */
@Injectable({ providedIn: 'root' })
export class BillingStatusService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(AuthSessionService);
  private readonly apiUrl = environment.apiUrl;

  private readonly statusSignal = signal<BillingStatusResponse | null>(null);
  private readonly loadingSignal = signal(false);
  private inflight: { businessId: string; promise: Promise<BillingStatusResponse | null> } | null =
    null;
  /** Último fallo de la API por negocio, para no reintentar en cada navegación. */
  private lastFailure: { businessId: string; at: number } | null = null;

  /** Estado del negocio activo; `null` mientras no se conozca. */
  readonly status = computed(() => {
    const status = this.statusSignal();
    const activeId = this.session.activeBusinessAccountId();
    return status && status.businessAccountId === activeId ? status : null;
  });
  readonly loading = this.loadingSignal.asReadonly();
  readonly state = computed(() => this.status()?.state ?? 'ok');
  readonly phase = computed(() => this.status()?.phase ?? 'none');
  readonly reason = computed(() => this.status()?.reason ?? null);
  readonly deadline = computed(() => this.status()?.deadline ?? null);
  readonly daysLeft = computed(() => this.status()?.daysLeft ?? null);
  readonly blockedAt = computed(() => this.status()?.blockedAt ?? null);
  readonly currentInvoice = computed(() => this.status()?.currentInvoice ?? null);
  /** Exentos de bloqueo: superadmin y soporte. */
  readonly isExempt = computed(() => this.session.isInternalOpsUser());
  readonly isBlocked = computed(() => !this.isExempt() && this.state() === 'blocked');
  /**
   * Propietario del negocio activo. Usa lo que reporta el backend y, si aún no
   * hay estado, la membership local.
   */
  readonly isOwner = computed(() => {
    const status = this.status();
    if (status) return status.isOwner;
    return this.session.activeMembership()?.role === 'account_owner';
  });

  constructor() {
    effect(() => {
      const authenticated = this.session.isAuthenticated();
      const businessId = this.session.activeBusinessAccountId();
      untracked(() => {
        if (!authenticated || !businessId) {
          this.reset();
          return;
        }
        if (this.statusSignal()?.businessAccountId !== businessId) {
          void this.load(businessId);
        }
      });
    });
  }

  /**
   * Devuelve el estado del negocio indicado, cargándolo si aún no se conoce.
   * Si la API falla resuelve `null` (los guards dejan pasar; el 402 del backend
   * sigue siendo la barrera real).
   */
  ensureLoaded(businessId: string): Promise<BillingStatusResponse | null> {
    const current = this.statusSignal();
    if (current?.businessAccountId === businessId) {
      return Promise.resolve(current);
    }
    if (
      this.lastFailure?.businessId === businessId &&
      Date.now() - this.lastFailure.at < FAILURE_RETRY_MS
    ) {
      return Promise.resolve(null);
    }
    return this.load(businessId);
  }

  /** Vuelve a consultar el estado del negocio activo. */
  refresh(): Promise<BillingStatusResponse | null> {
    const businessId = this.session.activeBusinessAccountId();
    if (!businessId || !this.session.isAuthenticated()) {
      this.reset();
      return Promise.resolve(null);
    }
    return this.load(businessId, true);
  }

  /** Marca el negocio como bloqueado a partir del 402 del backend. */
  markBlocked(error: BusinessBillingBlockedError): void {
    if (error.businessAccountId !== this.session.activeBusinessAccountId()) {
      // Respuesta tardía de otro negocio: no pisa el estado del activo.
      return;
    }

    const previous = this.statusSignal();
    const base = previous?.businessAccountId === error.businessAccountId ? previous : null;

    this.statusSignal.set({
      businessAccountId: error.businessAccountId,
      phase: base?.phase ?? (error.reason === 'trial_ended' ? 'trial' : 'paid'),
      state: 'blocked',
      reason: error.reason ?? base?.reason ?? null,
      deadline: base?.deadline ?? null,
      daysLeft: base?.daysLeft ?? null,
      blockedAt: error.blockedAt ?? base?.blockedAt ?? null,
      isOwner: base?.isOwner ?? this.session.activeMembership()?.role === 'account_owner',
      planName: base?.planName ?? null,
      currentInvoice: base?.currentInvoice ?? null,
      cutoffDate: base?.cutoffDate ?? null,
      billingPeriod: base?.billingPeriod,
      pendingBillingPeriod: base?.pendingBillingPeriod ?? null,
      pendingBillingPeriodEffectiveAt: base?.pendingBillingPeriodEffectiveAt ?? null,
    });
  }

  private load(businessId: string, force = false): Promise<BillingStatusResponse | null> {
    if (!force && this.inflight?.businessId === businessId) {
      return this.inflight.promise;
    }

    this.loadingSignal.set(true);
    const promise = firstValueFrom(
      this.http.get<BillingStatusResponse>(`${this.apiUrl}/subscriptions/billing-status`, {
        headers: new HttpHeaders({ 'x-business-account-id': businessId }),
      }),
    )
      .then((status) => {
        // Solo se guarda si sigue siendo el negocio activo (evita pisar el
        // estado tras un cambio rápido de negocio).
        if (status && status.businessAccountId === this.session.activeBusinessAccountId()) {
          this.statusSignal.set(status);
        }
        this.lastFailure = null;
        return status ?? null;
      })
      .catch(() => {
        this.lastFailure = { businessId, at: Date.now() };
        return null;
      })
      .finally(() => {
        if (this.inflight?.promise === promise) {
          this.inflight = null;
          this.loadingSignal.set(false);
        }
      });

    this.inflight = { businessId, promise };
    return promise;
  }

  private reset(): void {
    this.inflight = null;
    this.lastFailure = null;
    this.loadingSignal.set(false);
    this.statusSignal.set(null);
  }
}
