import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input as defineInput,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  LucideBell,
  LucideCircleCheck,
  LucideLoaderCircle,
  LucideMail,
  LucideMonitor,
  LucideReceipt,
  LucideSearch,
  LucideSmartphone,
  LucideTriangleAlert,
  LucideVolume2,
  LucideVolumeX,
} from '@lucide/angular';
import { debounceTime, distinctUntilChanged, skip } from 'rxjs';

import type { BankAccount } from '../../../../shared/models/bank-account.models';
import type {
  SourceEvent,
  SourceEventFilters,
  SourceEventStatus,
  SourceEventType,
} from '../../../../shared/models/source-event.models';
import type { TransactionTone } from '../../../../shared/utils/transaction-status';
import { Select, type SelectOption } from '../../../../shared/ui/select/select';
import { Toggle } from '../../../../shared/ui/toggle/toggle';
import { TtsPlaybackService } from '../../../source-events/services/tts-playback.service';
import { AutoFitRowsDirective } from './auto-fit-rows.directive';
import { DashboardPager } from './dashboard-pager';

const SOURCE_LABELS: Record<SourceEventType, string> = {
  WHATSAPP_INBOUND: 'WhatsApp',
  OCR_UPLOAD: 'Comprobante',
  BANK_SMS: 'SMS bancario',
  BANK_WEBHOOK: 'Aviso bancario',
  BANK_API_POLL: 'API bancaria',
  MANUAL_ENTRY: 'Manual',
  NOTIFIER_APP: 'App notificadora',
  EMAIL_GMAIL: 'Correo',
};

const STATUS_LABELS: Record<SourceEventStatus, string> = {
  received: 'Recibido',
  processing: 'Procesando',
  processed: 'Procesado',
  needs_review: 'Por revisar',
  failed: 'Falló',
  ignored: 'Ignorado',
};

const STATUS_TONES: Record<SourceEventStatus, TransactionTone> = {
  received: 'neutral',
  processing: 'neutral',
  processed: 'success',
  needs_review: 'warning',
  failed: 'error',
  ignored: 'neutral',
};

/** Opciones de tipo, estáticas y completas (no dependen de lo cargado). */
const SOURCE_OPTIONS: SelectOption[] = [
  { id: '', label: 'Todo origen' },
  { id: 'NOTIFIER_APP', label: 'Notificadores' },
  { id: 'EMAIL_GMAIL', label: 'Correos' },
];

const SOURCE_PHRASES: Record<SourceEventType, string> = {
  WHATSAPP_INBOUND: 'Llegó un mensaje de WhatsApp con un posible comprobante',
  OCR_UPLOAD: 'Se subió un comprobante para lectura automática',
  BANK_SMS: 'Se detectó una notificación bancaria por SMS',
  BANK_WEBHOOK: 'Se detectó una notificación bancaria asociada a una transacción',
  BANK_API_POLL: 'Se consultó al banco una transacción',
  MANUAL_ENTRY: 'Se registró un movimiento de forma manual',
  NOTIFIER_APP: 'La app notificadora reportó un movimiento del banco',
  EMAIL_GMAIL: 'Llegó un correo del banco con un posible comprobante',
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
    FormsModule,
    LucideBell,
    LucideCircleCheck,
    LucideLoaderCircle,
    LucideMail,
    LucideMonitor,
    LucideReceipt,
    LucideSearch,
    LucideSmartphone,
    LucideTriangleAlert,
    LucideVolume2,
    LucideVolumeX,
    Select,
    Toggle,
    AutoFitRowsDirective,
    DashboardPager,
  ],
  templateUrl: './dashboard-events.html',
  styleUrls: ['./dashboard-shared.scss', './dashboard-events.scss'],
})
export class DashboardEventsPanel {
  private readonly destroyRef = inject(DestroyRef);

  /** Lectura en voz alta de los eventos (el toggle de la cabecera). */
  readonly tts = inject(TtsPlaybackService);

  /** Eventos ya filtrados y paginados por el servidor (la ventana cargada). */
  readonly events = defineInput.required<SourceEvent[]>();
  readonly loading = defineInput(false);
  readonly error = defineInput('');
  /** IDs llegados en vivo y aún no vistos (resaltado estilo bandeja). */
  readonly unreadIds = defineInput<Set<string>>(new Set());
  /** Catálogo de cuentas bancarias por id, para mostrar nombre/plataforma. */
  readonly bankAccounts = defineInput<Map<string, BankAccount>>(new Map());
  /** Bancos disponibles para el select (fuente estable: cuentas del negocio). */
  readonly bankOptions = defineInput<string[]>([]);
  /** Hay más páginas en el servidor más allá de lo cargado. */
  readonly hasMore = defineInput(false);
  readonly loadingMore = defineInput(false);
  /** Eventos en vivo que encajan en el filtro y esperan ser mostrados. */

  /** Emite el id del evento que el usuario marcó como leído (al abrirlo). */
  readonly view = output<SourceEvent>();
  /** Cambios de filtro (con debounce) para que la sección recargue server-side. */
  readonly filtersChange = output<SourceEventFilters>();
  /** Solicita la siguiente página del servidor (cursor). */
  readonly loadMore = output<void>();
  /** Fundir los eventos en vivo acumulados al tope de la lista. */

  readonly search = signal('');
  readonly typeFilter = signal<string>('');
  readonly bankFilter = signal<string>('');

  readonly typeOptions = SOURCE_OPTIONS;

  /** Filtros normalizados que se envían al servidor. */
  private readonly filterValue = computed<SourceEventFilters>(() => ({
    sourceType: (this.typeFilter() || undefined) as SourceEventType | undefined,
    bankId: this.bankFilter() || undefined,
    q: this.search().trim() || undefined,
  }));

  /**
   * Agrupa los eventos cargados por transacción enlazada (o por sí mismos,
   * como grupo de 1, si todavía están sueltos): dos o más avisos del mismo
   * pago real (p. ej. correo + app notificadora) comparten `linkedTransactionId`
   * una vez que el backend los enlaza a la misma Transaction, y deben verse
   * como UNA sola fila con varios íconos de origen, no como filas duplicadas.
   */
  private readonly groups = computed(() => {
    const map = new Map<string, SourceEvent[]>();
    for (const event of this.events()) {
      const key = this.groupKey(event);
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
    return map;
  });

  private groupKey(event: SourceEvent): string {
    return event.linkedTransactionId ?? `event:${event.id}`;
  }

  /**
   * Un representante por grupo — el primero en llegar ("el primero que llega
   * crea el registro") — en el mismo orden en que trae el servidor.
   */
  readonly groupedEvents = computed<SourceEvent[]>(() => {
    const groups = this.groups();
    const seen = new Set<string>();
    const result: SourceEvent[] = [];
    for (const event of this.events()) {
      const key = this.groupKey(event);
      if (seen.has(key)) continue;
      seen.add(key);
      const group = groups.get(key) ?? [event];
      result.push(
        group.reduce((earliest, current) =>
          new Date(current.createdAt).getTime() < new Date(earliest.createdAt).getTime()
            ? current
            : earliest,
        ),
      );
    }
    return result;
  });

  // --- Paginado client-side sobre la ventana cargada --------------------------
  readonly pageSize = signal(10);
  readonly page = signal(1);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.groupedEvents().length / this.pageSize())),
  );

  /** Página efectiva acotada a [1, totalPages] (autocorrige si los datos
   *  encogen sin esperar interacción del usuario). */
  readonly currentPage = computed(() => Math.min(Math.max(1, this.page()), this.totalPages()));

  /** Página actual recortada (una fila por grupo). */
  readonly paged = computed(() => {
    const size = this.pageSize();
    const start = (this.currentPage() - 1) * size;
    return this.groupedEvents().slice(start, start + size);
  });

  /** Estamos en la última página cargada (donde ofrecemos "cargar más"). */
  readonly onLastPage = computed(() => this.currentPage() >= this.totalPages());

  constructor() {
    // Volver a la primera página cuando cambia un filtro: depende solo de los
    // signals de filtro (no de los datos ni de los eventos en vivo).
    effect(() => {
      this.search();
      this.typeFilter();
      this.bankFilter();
      this.page.set(1);
    });

    // Emite los filtros a la sección con debounce (el primer valor —el estado
    // inicial vacío— se omite porque la sección ya hace la carga inicial).
    toObservable(this.filterValue)
      .pipe(
        skip(1),
        debounceTime(300),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((filters) => this.filtersChange.emit(filters));
  }

  /** Enciende/apaga la voz. Debe correr en el gesto del click (desbloquea autoplay). */
  onToggleVoice(on: boolean): void {
    this.tts.setEnabled(on);
  }

  /** true si el propio evento o alguno de sus hermanos de grupo llegó en vivo y no se ha visto. */
  isUnread(event: SourceEvent): boolean {
    const group = this.groups().get(this.groupKey(event)) ?? [event];
    return group.some((sibling) => this.unreadIds().has(sibling.id));
  }

  openDetail(event: SourceEvent): void {
    this.view.emit(event);
  }

  /** Plataforma/banco del evento (Nequi, Bancolombia…) desde el normalizado. */
  platformLabel(event: SourceEvent): string {
    const bankId = event.normalized?.bankId;
    if (!bankId) {
      return '';
    }
    return bankId.charAt(0).toUpperCase() + bankId.slice(1);
  }

  /** Nombre de la cuenta bancaria asociada (o sus últimos 4 dígitos). */
  accountName(event: SourceEvent): string {
    if (!event.reportedBankAccountId) {
      return '';
    }
    const account = this.bankAccounts().get(event.reportedBankAccountId);
    if (!account) {
      return '';
    }
    return account.displayName?.trim() || `****${account.accountNumberLast4}`;
  }

  sourceLabel(type: SourceEventType): string {
    return SOURCE_LABELS[type] ?? type;
  }

  /**
   * Icono Lucide que representa el origen del evento, o `null` cuando no hay
   * icono y se muestra la etiqueta de texto. La app notificadora se desdobla en
   * celular (`smartphone`) o escritorio (`monitor`) según el sistema operativo
   * reportado en el payload; el correo usa `mail`.
   */
  eventIcon(event: SourceEvent): 'smartphone' | 'monitor' | 'mail' | null {
    if (event.sourceType === 'EMAIL_GMAIL') {
      return 'mail';
    }
    if (event.sourceType === 'NOTIFIER_APP') {
      return this.isDesktopNotifier(event) ? 'monitor' : 'smartphone';
    }
    return null;
  }

  /**
   * Distingue un evento de notificador de escritorio (Windows/macOS/Linux) de
   * uno móvil mirando `rawPayload.device.osVersion`. Ante la duda asume móvil,
   * que era el comportamiento previo de la app notificadora.
   */
  private isDesktopNotifier(event: SourceEvent): boolean {
    const device = event.rawPayload?.['device'] as { osVersion?: unknown } | undefined;
    const os = typeof device?.osVersion === 'string' ? device.osVersion.toLowerCase() : '';
    return os.includes('windows') || os.includes('mac') || os.includes('linux');
  }

  /**
   * Íconos a mostrar en la fila: uno por cada variante de origen presente en
   * el grupo (correo, app móvil, escritorio…), sin repetir. Cuando el pago
   * quedó confirmado por más de un notificador, la fila muestra ambos íconos
   * en vez de aparecer como dos filas separadas.
   */
  groupIcons(event: SourceEvent): Array<'smartphone' | 'monitor' | 'mail'> {
    const group = this.groups().get(this.groupKey(event)) ?? [event];
    const icons = new Set<'smartphone' | 'monitor' | 'mail'>();
    for (const sibling of group) {
      const icon = this.eventIcon(sibling);
      if (icon) icons.add(icon);
    }
    return [...icons];
  }

  /** Título del grupo de íconos: los orígenes distintos que reportaron este pago. */
  groupSourceLabel(event: SourceEvent): string {
    const group = this.groups().get(this.groupKey(event)) ?? [event];
    const labels = new Set(group.map((sibling) => this.sourceLabel(sibling.sourceType)));
    return [...labels].join(' + ');
  }

  /**
   * Estado visual del ícono de recibo: verde solo cuando el evento tiene una
   * transacción enlazada con un comprobante (`OCR_RECEIPT`) válido. `duplicate`
   * = el comprobante coincide con el de otra transacción (ver Conciliación).
   */
  receiptTone(event: SourceEvent): 'linked' | 'duplicate' | 'none' {
    return event.receipt?.status ?? 'none';
  }

  receiptTitle(event: SourceEvent): string {
    switch (this.receiptTone(event)) {
      case 'linked':
        return 'Tiene comprobante';
      case 'duplicate':
        return 'Comprobante duplicado (ver Conciliación)';
      default:
        return 'Sin comprobante todavía';
    }
  }

  statusLabel(status: SourceEventStatus): string {
    return STATUS_LABELS[status] ?? status;
  }

  statusTone(status: SourceEventStatus): TransactionTone {
    return STATUS_TONES[status] ?? 'neutral';
  }

  /**
   * Texto crudo que envió la app notificadora (título + cuerpo de la push),
   * para mostrar exactamente lo que llegó al teléfono. Vacío si no aplica.
   */
  private notifierText(event: SourceEvent): string {
    const notification = event.rawPayload?.['notification'] as
      | { title?: unknown; text?: unknown; bigText?: unknown }
      | undefined;
    if (!notification) {
      return '';
    }
    const parts = [notification.title, notification.text, notification.bigText]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter((part) => part.length > 0);
    return [...new Set(parts)].join(' — ');
  }

  /** Traduce el evento a una frase clara para el usuario. */
  description(event: SourceEvent): string {
    // Para la app notificadora mostramos el texto real de la notificación; el
    // resto de fuentes conservan su frase genérica.
    const base =
      (event.sourceType === 'NOTIFIER_APP' ? this.notifierText(event) : '') ||
      SOURCE_PHRASES[event.sourceType] ||
      'Se registró un evento';
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
    // Evita duplicar signos si el texto crudo ya termina en puntuación.
    return /[.!?…]$/.test(base) ? base : `${base}.`;
  }
}
