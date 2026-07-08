import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import type { SourceEvent } from '../../../shared/models/source-event.models';
import type { Notifier } from '../../../shared/models/notifier.models';
import type { PaymentTransaction } from '../../../shared/models/transaction.models';

/**
 * Canal en vivo por cuenta (SSE, multi-tópico). Pide un ticket efímero
 * autenticado y abre un `EventSource` contra `/source-events/stream`. Emite por
 * observables tipados cada mensaje entrante de la cuenta activa:
 * - `events$`         → nuevos source_events de banco.
 * - `transactions$`   → transacción creada/actualizada (mismo shape que la API).
 * - `notifierStatus$` → estado de un notificador tras su heartbeat.
 * Se reconecta solo (con ticket nuevo) ante caídas y al cambiar de negocio.
 *
 * La UI solo consume los observables y `connected`; no necesita conocer SSE.
 */
@Injectable({ providedIn: 'root' })
export class SourceEventsStreamService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(AuthSessionService);
  private readonly apiUrl = environment.apiUrl;

  private eventSource: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
    // desconecta al cerrar sesión.
    effect(() => {
      const token = this.session.accessToken();
      const accountId = this.session.activeBusinessAccountId();
      untracked(() => {
        if (token && accountId) {
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
    if (!this.session.accessToken() || !this.session.activeBusinessAccountId()) {
      return;
    }
    this.disconnect();

    this.http
      .post<{ ticket: string }>(`${this.apiUrl}/source-events/stream-ticket`, {})
      .subscribe({
        next: ({ ticket }) => this.openStream(ticket),
        error: () => this.scheduleReconnect(),
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

    source.addEventListener('ready', () => this.connected.set(true));

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
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }
}
