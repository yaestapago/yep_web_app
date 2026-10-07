import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { BillingStatusService } from '../../../core/services/billing-status.service';
import type { SourceEvent } from '../../../shared/models/source-event.models';
import type { Notifier } from '../../../shared/models/notifier.models';
import type { PaymentTransaction } from '../../../shared/models/transaction.models';

const RECONNECT_BASE_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 60_000;

/**
 * Canal en vivo por cuenta (SSE, multi-tópico). Pide un ticket efímero
 * autenticado y abre un `EventSource` contra `/source-events/stream`. Emite por
 * observables tipados cada mensaje entrante de la cuenta activa:
 * - `events$`         → nuevos source_events de banco.
 * - `transactions$`   → transacción creada/actualizada (mismo shape que la API).
 * - `notifierStatus$` → estado de un notificador tras su heartbeat.
 * Se reconecta solo (con ticket nuevo) ante caídas y al cambiar de negocio,
 * con backoff exponencial (3 s → 60 s). No conecta mientras el negocio activo
 * esté bloqueado por cobro (el ticket responde 402): reintenta solo cuando el
 * estado de cobro deja de ser "bloqueado".
 *
 * La UI solo consume los observables y `connected`; no necesita conocer SSE.
 */
@Injectable({ providedIn: 'root' })
export class SourceEventsStreamService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(AuthSessionService);
  private readonly billing = inject(BillingStatusService);
  private readonly apiUrl = environment.apiUrl;

  private eventSource: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly incoming = new Subject<SourceEvent>();
  private readonly incomingTransactions = new Subject<PaymentTransaction>();
  private readonly incomingNotifierStatus = new Subject<Notifier>();

  /** Eventos entrantes de la cuenta activa, en tiempo real. */
  readonly events$: Observable<SourceEvent> = this.incoming.asObservable();
  /** Transacciones creadas/actualizadas de la cuenta activa, en tiempo real. */
  readonly transactions$: Observable<PaymentTransaction> =
    this.incomingTransactions.asObservable();
  /** Estado de notificadores (tras heartbeat) de la cuenta activa. */
  readonly notifierStatus$: Observable<Notifier> =
    this.incomingNotifierStatus.asObservable();
  /** Estado de conexión, para afordances de UI. */
  readonly connected = signal(false);

  constructor() {
    // Conecta/reconecta cuando hay sesión y cambia el negocio activo; se
    // desconecta al cerrar sesión o si el negocio queda bloqueado por cobro.
    effect(() => {
      const token = this.session.accessToken();
      const accountId = this.session.activeBusinessAccountId();
      const blocked = this.billing.isBlocked();
      untracked(() => {
        if (token && accountId && !blocked) {
          this.reconnectAttempts = 0;
          this.connect();
        } else {
          this.disconnect();
        }
      });
    });
  }

  /** (Re)abre el stream para la cuenta/token actuales. Idempotente. */
  connect(): void {
    if (typeof EventSource === 'undefined') {
      return;
    }
    if (
      !this.session.accessToken() ||
      !this.session.activeBusinessAccountId() ||
      this.billing.isBlocked()
    ) {
      this.disconnect();
      return;
    }
    this.disconnect();

    this.http
      .post<{ ticket: string }>(`${this.apiUrl}/source-events/stream-ticket`, {})
      .subscribe({
        next: ({ ticket }) => this.openStream(ticket),
        error: (error: unknown) => {
          // 402: negocio bloqueado por cobro. El interceptor ya marcó el
          // estado; el effect reconecta cuando se desbloquee. No reintentar.
          if (error instanceof HttpErrorResponse && error.status === 402) {
            return;
          }
          this.scheduleReconnect();
        },
      });
  }

  /** Cierra el stream y cancela reintentos pendientes. */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected.set(false);
  }

  private openStream(ticket: string): void {
    const url = `${this.apiUrl}/source-events/stream?ticket=${encodeURIComponent(ticket)}`;
    const source = new EventSource(url);
    this.eventSource = source;

    source.addEventListener('ready', () => {
      this.reconnectAttempts = 0;
      this.connected.set(true);
    });

    source.addEventListener('source-event', (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as SourceEvent;
        this.incoming.next(parsed);
      } catch {
        // Ignora payloads malformados; el siguiente evento sigue su curso.
      }
    });

    source.addEventListener('transaction', (event) => {
      try {
        const parsed = JSON.parse(
          (event as MessageEvent).data,
        ) as PaymentTransaction;
        this.incomingTransactions.next(parsed);
      } catch {
        // Ignora payloads malformados.
      }
    });

    source.addEventListener('notifier-status', (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as Notifier;
        this.incomingNotifierStatus.next(parsed);
      } catch {
        // Ignora payloads malformados.
      }
    });

    source.onerror = () => {
      // EventSource reintentaría con el MISMO ticket (ya expirado), así que lo
      // cerramos y reconectamos con un ticket nuevo tras un breve backoff.
      this.connected.set(false);
      source.close();
      if (this.eventSource === source) {
        this.eventSource = null;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.billing.isBlocked()) {
      return;
    }
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
