import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideBellOff,
  LucideBellRing,
  LucideCircleCheck,
  LucideCircleHelp,
  LucideCircleX,
  LucideRefreshCw,
  LucideTriangleAlert,
} from '@lucide/angular';
import { EMPTY, Subject, catchError, interval, map, of, switchMap } from 'rxjs';

import { DEFAULT_SMS_PACKAGE_TOKEN } from '../../../../shared/models/bank.models';
import type {
  Notifier,
  NotifierCaptureHistoryEntry,
  NotifierCaptureSnapshot,
  NotifierDiagnosticReport,
  NotifierDiagnosticsResponse,
  NotifierSeenByPackageEntry,
  NotifierSelfTestFailureReason,
} from '../../../../shared/models/notifier.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { Button } from '../../../../shared/ui/button/button';
import { CardSection } from '../../../../shared/ui/card-section/card-section';
import { DescriptionItem } from '../../../../shared/ui/description-list/description-item';
import { DescriptionList } from '../../../../shared/ui/description-list/description-list';
import { Modal } from '../../../../shared/ui/modal/modal';
import { State } from '../../../../shared/ui/state/state';
import { StatusChip, type StatusChipTone } from '../../../../shared/ui/status-chip/status-chip';
import { Table } from '../../../../shared/ui/table/table';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { relativeFromMs } from '../../../../shared/utils/notifier-status';
import { knownAppLabel } from '../../../notifiers/components/notifier-device-diagnostics/notifier-device-diagnostics';
import { NotifiersApiService } from '../../../notifiers/services/notifiers-api.service';

/** Qué ícono acompaña a un estado: siempre ícono + palabra, nunca solo color. */
export type FlagKind = 'ok' | 'bad' | 'warn' | 'unknown';

export interface Flag {
  kind: FlagKind;
  tone: StatusChipTone;
  label: string;
}

/** Una fila de "Estado del celular": nombre, chip y detalle ("desde hace 3 min"). */
export interface StatusRow {
  key: string;
  label: string;
  flag: Flag;
  detail: string;
}

export interface SeenAppRow {
  packageName: string;
  appLabel: string | null;
  count: number;
  watched: boolean;
  /** Es la app de SMS por defecto que reportó el celular. */
  isSms: boolean;
}

/**
 * Estado de una cubeta de la línea de tiempo: `off` si CUALQUIER latido dentro
 * iba sin escuchar, `on` si todos escuchaban, `none` si no hubo latidos.
 */
export type TimelineBucketState = 'on' | 'off' | 'none';

export interface TimelineSegment {
  /** Inicio y fin de la cubeta (ISO). */
  start: string;
  end: string;
  state: TimelineBucketState;
  /** Latidos que cayeron en la cubeta. */
  count: number;
  /** Tooltip: rango horario y estado. */
  title: string;
}

export interface TimelineTransition {
  at: string;
  /** `true`: volvió a escuchar; `false`: dejó de escuchar. */
  active: boolean;
}

export interface TimelineSummary {
  /** Cubetas fijas, de la más vieja a la más reciente (siempre `TIMELINE_BUCKETS`). */
  segments: TimelineSegment[];
  /** Latidos dentro de la ventana. */
  points: number;
  /** Porcentaje (0–100) de latidos escuchando. */
  activePercent: number;
  /** Veces que pasó de escuchar a no escuchar (entre latidos consecutivos). */
  outages: number;
  /** Ventana cubierta (ISO). */
  from: string;
  to: string;
  /** Últimos cambios de estado, del más reciente al más viejo (máx. `TRANSITIONS_SHOWN`). */
  transitions: TimelineTransition[];
}

const TOP_APPS_SHOWN = 10;
const TRANSITIONS_SHOWN = 6;
/** Ventana de la línea de tiempo y tamaño de cubeta: 24 h en cubetas de 15 min. */
export const TIMELINE_WINDOW_MS = 24 * 60 * 60_000;
export const TIMELINE_BUCKET_MS = 15 * 60_000;
export const TIMELINE_BUCKETS = TIMELINE_WINDOW_MS / TIMELINE_BUCKET_MS;

const UNKNOWN_FLAG: Flag = { kind: 'unknown', tone: 'neutral', label: 'Sin dato' };

/** Causa de una prueba de escucha fallida, en palabras del dueño. */
export const SELF_TEST_REASON_COPY: Record<NotifierSelfTestFailureReason, string> = {
  not_posted:
    'La app no pudo mostrar la notificación de prueba (sin permiso de notificaciones).',
  listener_missed: 'El listener no la recibió.',
};

/** Texto de la causa, o `''` si no viene o es de una versión futura. */
export function selfTestReasonCopy(reason: string | null | undefined): string {
  if (!reason) return '';
  return SELF_TEST_REASON_COPY[reason as NotifierSelfTestFailureReason] ?? '';
}

/** Chip para un booleano del celular; `null`/ausente = la app no lo reporta. */
export function flagFor(
  value: boolean | null | undefined,
  okLabel: string,
  badLabel: string,
  badKind: Exclude<FlagKind, 'ok' | 'unknown'> = 'bad',
): Flag {
  if (value === true) return { kind: 'ok', tone: 'success', label: okLabel };
  if (value === false) {
    return { kind: badKind, tone: badKind === 'warn' ? 'warning' : 'error', label: badLabel };
  }
  return UNKNOWN_FLAG;
}

/** Qué hacer cuando Android no le entrega a YEP las notificaciones de tipo conversación. */
export const CONVERSATIONS_BLOCKED_DETAIL =
  'Android no le entrega los SMS a YEP. En el celular: Ajustes → Acceso a notificaciones → YEP Notifyer → activa «Conversaciones».';

/**
 * Chip de "Conversaciones (SMS)" (`capture.conversationsAllowed`, app ≥ 1.0.9).
 * `null`/ausente = la app aún no lo ha probado (o Android < 12, sin ese filtro).
 */
export function conversationsFlag(value: boolean | null | undefined): Flag {
  if (value === true || value === false) {
    return flagFor(value, 'Permitidas', 'Bloqueadas', 'warn');
  }
  return { kind: 'unknown', tone: 'neutral', label: 'Sin probar' };
}

/**
 * Paquetes que el celular vigila, en minúsculas: `watchedPackages` del
 * notifier (con `@default_sms` expandido a la app de SMS reportada),
 * `watchRules` si el backend las expone y lo que la app dijo en su último
 * reporte (`rules.watched`).
 */
export function watchedPackageSet(
  notifier: Pick<Notifier, 'watchedPackages' | 'watchRules' | 'pairedDevice'> | null | undefined,
  latestReport: NotifierDiagnosticReport | null | undefined,
): Set<string> {
  const watched = new Set<string>();
  if (!notifier) return watched;
  const sms = notifier.pairedDevice?.defaultSmsPackage?.toLowerCase() ?? null;
  const add = (pkg: string | null | undefined): void => {
    if (!pkg) return;
    const normalized = pkg.trim().toLowerCase();
    if (!normalized) return;
    if (normalized === DEFAULT_SMS_PACKAGE_TOKEN) {
      if (sms) watched.add(sms);
      return;
    }
    watched.add(normalized);
  };
  notifier.watchedPackages?.forEach(add);
  notifier.watchRules?.forEach((rule) => rule.packageNames?.forEach(add));
  latestReport?.report?.rules?.watched?.forEach(add);
  return watched;
}

/**
 * Normaliza `seenByPackage`: el backend actual manda `[{ packageName, count }]`;
 * uno anterior mandaba `{ paquete: n }`. Descarta entradas malformadas.
 */
export function seenByPackageEntries(
  value: NotifierCaptureSnapshot['seenByPackage'],
): NotifierSeenByPackageEntry[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter(
        (entry): entry is NotifierSeenByPackageEntry =>
          !!entry &&
          typeof entry === 'object' &&
          typeof entry.packageName === 'string' &&
          entry.packageName.trim() !== '' &&
          typeof entry.count === 'number',
      )
      .map((entry) => ({ packageName: entry.packageName, count: entry.count }));
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([packageName, count]) => packageName.trim() !== '' && typeof count === 'number')
      .map(([packageName, count]) => ({ packageName, count }));
  }
  return [];
}

/** Top de apps por notificaciones vistas, marcando las vigiladas y la de SMS. */
export function topSeenApps(
  seenByPackage: NotifierCaptureSnapshot['seenByPackage'],
  watched: Set<string>,
  smsPackage: string | null | undefined,
  limit: number = TOP_APPS_SHOWN,
): SeenAppRow[] {
  const sms = smsPackage?.toLowerCase() ?? null;
  return seenByPackageEntries(seenByPackage)
    .filter(({ count }) => Number.isFinite(count) && count > 0)
    .sort((a, b) => b.count - a.count || a.packageName.localeCompare(b.packageName))
    .slice(0, limit)
    .map(({ packageName, count }) => {
      const lower = packageName.toLowerCase();
      return {
        packageName,
        appLabel: knownAppLabel(packageName),
        count,
        watched: watched.has(lower),
        isSms: sms !== null && lower === sms,
      };
    });
}

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** `HH:mm` con el reloj del navegador (solo para tooltips). */
function clockLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

const BUCKET_STATE_LABEL: Record<TimelineBucketState, string> = {
  on: 'Escuchando',
  off: 'Sin escuchar',
  none: 'Sin datos',
};

/**
 * Resume la línea de tiempo de las últimas 24 h (hasta `now`) en cubetas fijas
 * de 15 min: siempre `TIMELINE_BUCKETS` segmentos, así la tira cabe en
 * cualquier ancho y el extremo derecho (lo más reciente) nunca se recorta.
 * Latidos fuera de la ventana o sin fecha válida se descartan. El porcentaje,
 * los cortes y los últimos cambios se calculan sobre los latidos, no sobre las
 * cubetas, para conservar la hora exacta.
 */
export function summarizeTimeline(
  history: NotifierCaptureHistoryEntry[] | null | undefined,
  now: number = Date.now(),
): TimelineSummary {
  const windowStart = now - TIMELINE_WINDOW_MS;
  const ordered = (history ?? [])
    .map((entry) => ({ entry, ms: parseMs(entry.at) }))
    .filter(
      (item): item is { entry: NotifierCaptureHistoryEntry; ms: number } =>
        item.ms !== null && item.ms > windowStart && item.ms <= now,
    )
    .sort((a, b) => a.ms - b.ms);

  // Cubeta 0 = la más reciente (termina en `now`); se emiten de vieja a nueva.
  const states: TimelineBucketState[] = Array.from({ length: TIMELINE_BUCKETS }, () => 'none');
  const counts: number[] = Array.from({ length: TIMELINE_BUCKETS }, () => 0);
  for (const { entry, ms } of ordered) {
    const index = Math.min(TIMELINE_BUCKETS - 1, Math.floor((now - ms) / TIMELINE_BUCKET_MS));
    counts[index] += 1;
    if (entry.captureActive !== true) {
      states[index] = 'off';
    } else if (states[index] === 'none') {
      states[index] = 'on';
    }
  }

  const segments: TimelineSegment[] = [];
  for (let index = TIMELINE_BUCKETS - 1; index >= 0; index -= 1) {
    const end = now - index * TIMELINE_BUCKET_MS;
    const start = end - TIMELINE_BUCKET_MS;
    const state = states[index];
    const count = counts[index];
    const latidos = count === 1 ? '1 latido' : `${count} latidos`;
    segments.push({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      state,
      count,
      title: `${clockLabel(start)}–${clockLabel(end)} · ${BUCKET_STATE_LABEL[state]}${
        count > 0 ? ` (${latidos})` : ''
      }`,
    });
  }

  let outages = 0;
  const transitions: TimelineTransition[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const active = ordered[i].entry.captureActive === true;
    const previous = ordered[i - 1].entry.captureActive === true;
    if (active !== previous) {
      transitions.push({ at: ordered[i].entry.at, active });
      if (!active) outages += 1;
    }
  }

  const activeCount = ordered.filter(({ entry }) => entry.captureActive === true).length;
  return {
    segments,
    points: ordered.length,
    activePercent: ordered.length ? Math.round((activeCount / ordered.length) * 100) : 0,
    outages,
    from: new Date(windowStart).toISOString(),
    to: new Date(now).toISOString(),
    transitions: transitions.slice(-TRANSITIONS_SHOWN).reverse(),
  };
}

/**
 * Modal "Diagnóstico de escucha" de un notificador de celular: lo que el
 * teléfono reportó en su último latido (si Android tiene enlazado el servicio
 * que lee notificaciones, permiso, servicio, batería), qué ha visto el
 * listener, qué hizo el filtro nativo, la prueba de escucha, la línea de tiempo
 * de las últimas 24 h y el último reporte que mandó la app.
 *
 * Carga `GET /notifiers/:id/diagnostics` al abrirse. Si falla, muestra lo que
 * ya venía en el notifier (`capture`, `captureHistory`, `latestDiagnosticReport`).
 * Solo lectura: reconectar se hace desde la app del celular.
 */
@Component({
  selector: 'app-notifier-diagnostics-modal',
  imports: [
    DatePipe,
    Alert,
    Button,
    CardSection,
    DescriptionItem,
    DescriptionList,
    Modal,
    State,
    StatusChip,
    Table,
    LucideBellOff,
    LucideBellRing,
    LucideCircleCheck,
    LucideCircleHelp,
    LucideCircleX,
    LucideRefreshCw,
    LucideTriangleAlert,
  ],
  templateUrl: './notifier-diagnostics-modal.html',
  styleUrls: ['./business-sections.scss', './notifier-diagnostics-modal.scss'],
})
export class NotifierDiagnosticsModal {
  private readonly api = inject(NotifiersApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly notifier = input<Notifier | null>(null);
  readonly open = input(false);
  readonly closeRequested = output<void>();

  readonly loading = signal(false);
  readonly error = signal('');
  readonly data = signal<NotifierDiagnosticsResponse | null>(null);
  /** Reloj para los "hace X"; avanza cada 30 s mientras el modal está abierto. */
  private readonly now = signal(Date.now());

  /** Solo el id: así un refresco de la lista no recarga el diagnóstico. */
  private readonly notifierId = computed(() => this.notifier()?.id ?? null);

  readonly subtitle = computed(() => {
    const notifier = this.notifier();
    const name = notifier?.displayName || notifier?.identifier || 'Notificador';
    const device = [notifier?.pairedDevice?.manufacturer, notifier?.pairedDevice?.model]
      .filter(Boolean)
      .join(' ');
    const version = notifier?.pairedDevice?.appVersion;
    return [name, device, version ? `app ${version}` : '']
      .filter(Boolean)
      .join(' · ');
  });

  /** Foto de captura: la del detalle, o la que ya traía el notifier. */
  readonly capture = computed<NotifierCaptureSnapshot | null>(
    () => this.data()?.capture ?? this.notifier()?.capture ?? null,
  );

  readonly history = computed<NotifierCaptureHistoryEntry[]>(
    () => this.data()?.captureHistory ?? this.notifier()?.captureHistory ?? [],
  );

  readonly reports = computed<NotifierDiagnosticReport[]>(() => this.data()?.reports ?? []);

  /** Reporte más reciente completo, o el resumen que trae el notifier. */
  readonly latestReport = computed<NotifierDiagnosticReport | null>(() => {
    const full = this.reports()[0];
    if (full) return full;
    const summary = this.notifier()?.latestDiagnosticReport;
    if (!summary) return null;
    return {
      at: summary.at,
      appVersion: summary.appVersion ?? null,
      report: summary.summary
        ? {
            health: {
              listenerConnected: summary.summary.listenerConnected ?? null,
              seenTotal: summary.summary.seenTotal ?? null,
              selfTest:
                summary.summary.selfTestOk === null || summary.summary.selfTestOk === undefined
                  ? null
                  : { ok: summary.summary.selfTestOk },
            },
          }
        : null,
    };
  });

  readonly hasData = computed(
    () => this.capture() !== null || this.history().length > 0 || this.latestReport() !== null,
  );

  /** Chip grande: lo que la app concluyó en el último latido. */
  readonly overall = computed<Flag>(() => {
    const capture = this.capture();
    if (!capture) return UNKNOWN_FLAG;
    return flagFor(capture.captureActive, 'Escuchando', 'Sin escuchar', 'warn');
  });

  /** Android soltó el servicio que lee notificaciones: hay que reconectar desde la app. */
  readonly listenerDown = computed(() => this.capture()?.listenerConnected === false);

  readonly reportedAgo = computed(() => this.since(this.capture()?.at));

  readonly sourceLabel = computed(() => {
    switch (this.capture()?.source) {
      case 'foreground':
        return 'servicio en primer plano';
      case 'workmanager':
        return 'respaldo de WorkManager';
      case 'ui':
        return 'app abierta';
      default:
        return '';
    }
  });

  readonly statusRows = computed<StatusRow[]>(() => {
    const capture = this.capture();
    if (!capture) return [];
    const rows: StatusRow[] = [
      {
        key: 'listener',
        label: 'Acceso a notificaciones (listener)',
        flag: flagFor(capture.listenerConnected, 'Conectado', 'Desconectado'),
        detail:
          capture.listenerConnected === true
            ? this.sinceLabel('desde', capture.listenerConnectedAt)
            : capture.listenerConnected === false
              ? this.sinceLabel('desde', capture.listenerDisconnectedAt)
              : '',
      },
      {
        key: 'permission',
        label: 'Permiso de notificaciones',
        flag: flagFor(capture.permissionGranted, 'Concedido', 'Sin permiso'),
        detail: '',
      },
      {
        // Ahí caen los SMS de Google Messages: apagado, el listener corre pero no los ve.
        key: 'conversations',
        label: 'Conversaciones (SMS)',
        flag: conversationsFlag(capture.conversationsAllowed),
        detail: capture.conversationsAllowed === false ? CONVERSATIONS_BLOCKED_DETAIL : '',
      },
      {
        key: 'notifications',
        label: 'Avisos de la app',
        flag: flagFor(capture.notificationsEnabled, 'Permitidos', 'Bloqueados', 'warn'),
        detail:
          capture.notificationsEnabled === false
            ? 'Sin este permiso la app no puede hacer la prueba de escucha ni avisarte si algo falla.'
            : '',
      },
      {
        key: 'service',
        label: 'Servicio en primer plano',
        flag: flagFor(capture.serviceRunning, 'Activo', 'Detenido'),
        detail: '',
      },
      {
        key: 'battery',
        label: 'Batería',
        flag: flagFor(capture.batteryUnrestricted, 'Sin restricciones', 'Restringida', 'warn'),
        detail:
          capture.batteryUnrestricted === false
            ? 'Android puede matar la app para ahorrar batería.'
            : '',
      },
    ];
    if (capture.componentEnabled === false) {
      rows.push({
        key: 'component',
        label: 'Componente del listener',
        flag: flagFor(false, 'Habilitado', 'Deshabilitado'),
        detail: 'La app lo está alternando para forzar la reconexión.',
      });
    }
    return rows;
  });

  readonly processSince = computed(() => this.since(this.capture()?.processStartedAt));
  readonly rebindAttempts = computed(() => this.capture()?.rebindAttempts ?? 0);
  readonly lastRebindAgo = computed(() => this.since(this.capture()?.lastRebindAt));

  /** Última notificación de cualquier app: el notifier (persistido) o la foto. */
  readonly lastNotificationAt = computed(
    () => this.notifier()?.lastNotificationAt ?? this.latestHistoryNotificationAt() ?? null,
  );
  readonly lastNotificationAgo = computed(() => this.since(this.lastNotificationAt()));
  readonly lastNotificationApp = computed(() => {
    const pkg = this.capture()?.lastNotificationPackage ?? null;
    return pkg ? { packageName: pkg, appLabel: knownAppLabel(pkg) } : null;
  });

  /** Respaldo si el notifier aún no persiste `lastNotificationAt`: la entrada más reciente que lo traiga. */
  private readonly latestHistoryNotificationAt = computed(() => {
    const last = [...this.history()]
      .filter((entry) => entry.lastNotificationAt)
      .sort((a, b) => (parseMs(b.at) ?? 0) - (parseMs(a.at) ?? 0))[0];
    return last?.lastNotificationAt ?? null;
  });

  readonly seenTotal = computed(() => this.capture()?.seenTotal ?? null);

  readonly watched = computed(() => watchedPackageSet(this.notifier(), this.latestReport()));

  readonly topApps = computed<SeenAppRow[]>(() =>
    topSeenApps(
      this.capture()?.seenByPackage,
      this.watched(),
      this.notifier()?.pairedDevice?.defaultSmsPackage,
    ),
  );

  readonly receiver = computed(() => this.capture()?.receiver ?? null);
  readonly receiverLastReceivedAgo = computed(() => this.since(this.receiver()?.lastReceivedAt));
  readonly receiverLastStoredAgo = computed(() => this.since(this.receiver()?.lastStoredAt));
  readonly rulesFlag = computed(() =>
    flagFor(this.receiver()?.rulesLoaded, 'Cargadas', 'Sin reglas', 'warn'),
  );

  readonly selfTest = computed(() => this.capture()?.selfTest ?? null);
  readonly selfTestFlag = computed<Flag>(() => {
    const test = this.selfTest();
    if (!test || test.ok === null || test.ok === undefined) {
      return { kind: 'unknown', tone: 'neutral', label: 'Sin prueba todavía' };
    }
    return flagFor(test.ok, 'Funcionó', 'Falló');
  });
  readonly selfTestAgo = computed(() => this.since(this.selfTest()?.at));
  /** Solo cuando la prueba falló y la app dijo por qué. */
  readonly selfTestReason = computed(() => {
    const test = this.selfTest();
    return test?.ok === false ? selfTestReasonCopy(test.reason) : '';
  });
  /** La parte "conversación" de la prueba no llegó (app ≥ 1.0.9). */
  readonly selfTestConversationMissed = computed(
    () => this.selfTest()?.conversationOk === false,
  );

  /** Se recalcula con el reloj: la ventana de 24 h termina en "ahora". */
  readonly timeline = computed(() => summarizeTimeline(this.history(), this.now()));

  readonly reportHealth = computed(() => this.latestReport()?.report?.health ?? null);
  readonly reportDevice = computed(() => {
    const device = this.latestReport()?.report?.device;
    return [device?.manufacturer, device?.model, device?.osVersion ? `Android ${device.osVersion}` : '']
      .filter(Boolean)
      .join(' · ');
  });
  readonly reportRulesVersion = computed(
    () => this.latestReport()?.report?.rules?.rulesVersion?.slice(0, 8) ?? '',
  );
  readonly reportNearMisses = computed(
    () => this.latestReport()?.report?.nearMisses?.length ?? 0,
  );
  readonly reportListenerFlag = computed(() =>
    flagFor(this.reportHealth()?.listenerConnected, 'Conectado', 'Desconectado'),
  );
  readonly reportSelfTestFlag = computed<Flag>(() => {
    const ok = this.reportHealth()?.selfTest?.ok;
    if (ok === null || ok === undefined) {
      return { kind: 'unknown', tone: 'neutral', label: 'Sin prueba' };
    }
    return flagFor(ok, 'Funcionó', 'Falló');
  });

  /**
   * Peticiones de diagnóstico por id. `switchMap` cancela la anterior al llegar
   * un id nuevo (o `null` al cerrar), así una respuesta tardía de otro
   * notificador nunca pisa `data`/`loading` del vigente.
   */
  private readonly loadRequests = new Subject<string | null>();

  constructor() {
    this.loadRequests
      .pipe(
        switchMap((id) =>
          id === null
            ? EMPTY
            : this.api.diagnostics(id).pipe(
                map((response) => ({ id, response, error: null as unknown })),
                catchError((error: unknown) =>
                  of({ id, response: null as NotifierDiagnosticsResponse | null, error }),
                ),
              ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ id, response, error }) => {
        // Defensa extra: solo el notificador que está abierto ahora.
        if (id !== this.notifierId()) return;
        this.loading.set(false);
        if (error) {
          this.data.set(null);
          this.error.set(httpErrorMessage(error));
          return;
        }
        this.data.set(response);
        this.now.set(Date.now());
      });

    effect(() => {
      const id = this.open() ? this.notifierId() : null;
      untracked(() => (id ? this.load(id) : this.cancel()));
    });

    interval(30_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.open()) this.now.set(Date.now());
      });
  }

  reload(): void {
    const id = this.notifierId();
    if (id) this.load(id);
  }

  close(): void {
    this.closeRequested.emit();
  }

  /** `hace 3 min`, o `—` si no hay fecha. */
  since(value: string | null | undefined): string {
    const ms = parseMs(value);
    if (ms === null) return '—';
    return relativeFromMs(Math.max(0, this.now() - ms));
  }

  private sinceLabel(prefix: string, value: string | null | undefined): string {
    const ms = parseMs(value);
    return ms === null ? '' : `${prefix} ${relativeFromMs(Math.max(0, this.now() - ms))}`;
  }

  /** Id cuyo detalle está en `data`; al cambiar de notificador se descarta lo anterior. */
  private loadedId: string | null = null;

  private load(id: string): void {
    if (this.loadedId !== id) {
      this.data.set(null);
      this.loadedId = id;
    }
    this.loading.set(true);
    this.error.set('');
    this.now.set(Date.now());
    this.loadRequests.next(id);
  }

  /** Al cerrar: cancela la petición en vuelo y apaga el estado de carga. */
  private cancel(): void {
    this.loadRequests.next(null);
    this.loading.set(false);
  }
}
