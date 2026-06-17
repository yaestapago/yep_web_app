import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, input as defineInput, signal } from '@angular/core';
import {
  LucideBanknote,
  LucideCircleCheck,
  LucideFileText,
  LucideLoaderCircle,
  LucideMessageSquare,
  LucideSearch,
  LucideTriangleAlert,
} from '@lucide/angular';

import type {
  SourceEvent,
  SourceEventStatus,
  SourceEventType,
} from '../../../../shared/models/source-event.models';
import type { TransactionTone } from '../../../../shared/utils/transaction-status';

const SOURCE_LABELS: Record<SourceEventType, string> = {
  WHATSAPP_INBOUND: 'WhatsApp',
  OCR_UPLOAD: 'Comprobante',
  BANK_SMS: 'SMS bancario',
  BANK_WEBHOOK: 'Aviso bancario',
  BANK_API_POLL: 'API bancaria',
  MANUAL_ENTRY: 'Manual',
  NOTIFIER_APP: 'App notificadora',
};

const STATUS_LABELS: Record<SourceEventStatus, string> = {
  received: 'Recibido',
  processing: 'Procesando',
  processed: 'Procesado',
  failed: 'Falló',
  ignored: 'Ignorado',
};

const STATUS_TONES: Record<SourceEventStatus, TransactionTone> = {
  received: 'neutral',
  processing: 'neutral',
  processed: 'success',
  failed: 'error',
  ignored: 'neutral',
};

const SOURCE_PHRASES: Record<SourceEventType, string> = {
  WHATSAPP_INBOUND: 'Llegó un mensaje de WhatsApp con un posible comprobante',
  OCR_UPLOAD: 'Se subió un comprobante para lectura automática',
  BANK_SMS: 'Se detectó una notificación bancaria por SMS',
  BANK_WEBHOOK: 'Se detectó una notificación bancaria asociada a una transacción',
  BANK_API_POLL: 'Se consultó al banco una transacción',
  MANUAL_ENTRY: 'Se registró un movimiento de forma manual',
  NOTIFIER_APP: 'La app notificadora reportó un movimiento del banco',
};

/**
 * Zona 3: eventos en lenguaje claro (sin logs técnicos crudos) con filtros
 * compactos. El filtrado es client-side sobre los eventos ya cargados.
 */
@Component({
  selector: 'app-dashboard-events',
  imports: [
    CurrencyPipe,
    DatePipe,
    LucideBanknote,
    LucideCircleCheck,
    LucideFileText,
    LucideLoaderCircle,
    LucideMessageSquare,
    LucideSearch,
    LucideTriangleAlert,
  ],
  templateUrl: './dashboard-events.html',
  styleUrls: ['./dashboard-shared.scss', './dashboard-events.scss'],
})
export class DashboardEventsPanel {
  readonly events = defineInput.required<SourceEvent[]>();
  readonly loading = defineInput(false);
  readonly error = defineInput('');

  readonly search = signal('');
  readonly typeFilter = signal<string>('');
  readonly statusFilter = signal<string>('');
  readonly bankFilter = signal<string>('');

  readonly typeOptions = computed(() => {
    const set = new Set<SourceEventType>();
    for (const event of this.events()) {
      set.add(event.sourceType);
    }
    return [...set].map((value) => ({ value, label: SOURCE_LABELS[value] ?? value }));
  });

  readonly bankOptions = computed(() => {
    const set = new Set<string>();
    for (const event of this.events()) {
      const bank = event.normalized?.bankId;
      if (bank) {
        set.add(bank);
      }
    }
    return [...set];
  });

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const type = this.typeFilter();
    const status = this.statusFilter();
    const bank = this.bankFilter();

    return this.events().filter((event) => {
      if (type && event.sourceType !== type) {
        return false;
      }
      if (status && event.status !== status) {
        return false;
      }
      if (bank && event.normalized?.bankId !== bank) {
        return false;
      }
      if (term) {
        const haystack = [
          event.normalized?.reference,
          event.externalId,
          event.normalized?.amount?.toString(),
          this.description(event),
          SOURCE_LABELS[event.sourceType],
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) {
          return false;
        }
      }
      return true;
    });
  });

  sourceLabel(type: SourceEventType): string {
    return SOURCE_LABELS[type] ?? type;
  }

  statusLabel(status: SourceEventStatus): string {
    return STATUS_LABELS[status] ?? status;
  }

  statusTone(status: SourceEventStatus): TransactionTone {
    return STATUS_TONES[status] ?? 'neutral';
  }

  /** Traduce el evento a una frase clara para el usuario. */
  description(event: SourceEvent): string {
    const base = SOURCE_PHRASES[event.sourceType] ?? 'Se registró un evento';
    if (event.status === 'failed') {
      return `${base}, pero no pudo procesarse. Requiere revisión manual.`;
    }
    if (event.status === 'ignored') {
      return `${base}, pero se descartó por no corresponder a un pago.`;
    }
    if (event.status === 'processed') {
      const reference = event.normalized?.reference;
      return reference
        ? `${base} y se asoció a la transacción ${reference}.`
        : `${base} y se procesó correctamente.`;
    }
    if (event.status === 'processing') {
      return `${base}. Se está procesando.`;
    }
    return `${base}.`;
  }

  iconFor(type: SourceEventType): 'message' | 'bank' | 'file' {
    if (type === 'WHATSAPP_INBOUND') {
      return 'message';
    }
    if (type === 'OCR_UPLOAD' || type === 'MANUAL_ENTRY') {
      return 'file';
    }
    return 'bank';
  }
}
