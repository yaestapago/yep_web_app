import type { StatusChipTone } from '../../../shared/ui/status-chip/status-chip';
import type {
  AnnouncementApp,
  AppRelease,
  AppReleasePayload,
  AppReleaseSlot,
  NotifierVersionCount,
} from '../models/announcement.models';
import {
  ANNOUNCEMENTS_MIN_APP_VERSION,
  DEFAULT_STORE_URLS,
  releaseSlotKey,
} from '../models/announcement.models';
import { BODY_MAX, TITLE_MAX } from './announcement-form';
import { APP_LABELS, PLATFORM_LABELS } from './announcement-labels';
import { compareAppVersions, isValidVersionInput } from './app-version';

export interface AppReleaseFormValue {
  latestVersion: string;
  minSupportedVersion: string;
  storeUrl: string;
  title: string;
  body: string;
  notify: boolean;
  enabled: boolean;
}

export type AppReleaseFormErrors = Partial<Record<keyof AppReleaseFormValue, string>>;

/**
 * Key del aviso de actualizar vigente (`update:<app>:<platform>:<latestVersion>`): la que
 * manda el backend en la política o, si no viene, armada con la versión guardada.
 */
export function updateAnnouncementKey(
  slot: AppReleaseSlot,
  release: Pick<AppRelease, 'key' | 'latestVersion'> | null,
): string | null {
  if (!release) return null;
  if (release.key) return release.key;
  const version = release.latestVersion?.trim();
  return version ? `update:${slot.app}:${slot.platform}:${version}` : null;
}

export function releaseSlotTitle(slot: AppReleaseSlot): string {
  return `${APP_LABELS[slot.app]} · ${PLATFORM_LABELS[slot.platform]}`;
}

export function storeName(slot: AppReleaseSlot): string {
  return slot.platform === 'ios' ? 'App Store' : 'Google Play';
}

/** Valor inicial: la política guardada o, si no hay, la URL de tienda por defecto. */
export function releaseToForm(
  slot: AppReleaseSlot,
  release: AppRelease | null,
): AppReleaseFormValue {
  if (!release) {
    return {
      latestVersion: '',
      minSupportedVersion: '',
      storeUrl: DEFAULT_STORE_URLS[releaseSlotKey(slot)] ?? '',
      title: '',
      body: '',
      notify: true,
      enabled: true,
    };
  }
  return {
    latestVersion: release.latestVersion ?? '',
    minSupportedVersion: release.minSupportedVersion ?? '',
    storeUrl: release.storeUrl || DEFAULT_STORE_URLS[releaseSlotKey(slot)] || '',
    title: release.title ?? '',
    body: release.body ?? '',
    notify: release.notify,
    enabled: release.enabled,
  };
}

export function validateReleaseForm(value: AppReleaseFormValue): AppReleaseFormErrors {
  const errors: AppReleaseFormErrors = {};
  const latest = value.latestVersion.trim();
  const min = value.minSupportedVersion.trim();
  if (!latest) errors.latestVersion = 'Escribe la última versión.';
  else if (!isValidVersionInput(latest))
    errors.latestVersion = 'Usa números con puntos, por ejemplo 1.0.10.';
  if (min && !isValidVersionInput(min)) {
    errors.minSupportedVersion = 'Usa números con puntos, por ejemplo 1.0.9.';
  } else if (min && !errors.latestVersion && compareAppVersions(min, latest) === 1) {
    errors.minSupportedVersion = 'No puede ser mayor que la última versión.';
  }
  if (!/^https:\/\/\S+$/i.test(value.storeUrl.trim())) {
    errors.storeUrl = 'Pon el enlace de la tienda, empezando por https://';
  }
  if (value.title.trim().length > TITLE_MAX) errors.title = `Máximo ${TITLE_MAX} caracteres.`;
  if (value.body.trim().length > BODY_MAX) errors.body = `Máximo ${BODY_MAX} caracteres.`;
  return errors;
}

export function releaseFormToPayload(value: AppReleaseFormValue): AppReleasePayload {
  return {
    latestVersion: value.latestVersion.trim(),
    minSupportedVersion: value.minSupportedVersion.trim() || null,
    storeUrl: value.storeUrl.trim(),
    title: value.title.trim() || null,
    body: value.body.trim() || null,
    notify: value.notify,
    enabled: value.enabled,
  };
}

/** Textos por defecto del aviso de actualizar (contrato), para mostrarlos como ejemplo. */
export function defaultUpdateCopy(
  app: AnnouncementApp,
  version: string,
  mandatory: boolean,
): { title: string; body: string } {
  const v = version.trim() || 'X';
  if (!mandatory) {
    return {
      title: 'Hay una versión nueva de YEP',
      body: `Actualiza a la versión ${v} para seguir recibiendo las mejoras.`,
    };
  }
  return {
    title: 'Actualiza YEP para seguir usándola',
    body:
      app === 'notifier'
        ? `Tu versión ya no es compatible. Actualiza a la versión ${v}; la escucha de pagos sigue funcionando mientras tanto.`
        : `Tu versión ya no es compatible. Actualiza a la versión ${v}.`,
  };
}

export type VersionStanding = 'below_min' | 'below_latest' | 'current' | 'unknown';

export interface NotifierVersionRow {
  version: string;
  count: number;
  /** 0–100, ancho de la barra respecto a la versión con más celulares. */
  share: number;
  standing: VersionStanding;
  standingLabel: string;
  tone: StatusChipTone;
  /** Anterior a 1.0.10: no muestra anuncios (tampoco el de actualizar). */
  legacy: boolean;
  /** Qué le pasaría a ese celular. */
  note: string;
}

const STANDING: Record<VersionStanding, { label: string; tone: StatusChipTone; note: string }> = {
  below_min: {
    label: 'Debajo de la mínima',
    tone: 'error',
    note: 'Le sale el aviso de actualizar y no lo puede cerrar.',
  },
  below_latest: {
    label: 'Debajo de la última',
    tone: 'warning',
    note: 'Le sale el aviso de actualizar; lo puede posponer.',
  },
  current: { label: 'Al día', tone: 'success', note: '' },
  unknown: {
    label: 'Versión desconocida',
    tone: 'neutral',
    note: 'No se compara: no informó una versión legible.',
  },
};

const LEGACY_NOTE = 'No ve avisos: es anterior a la 1.0.10. Toca escribirle.';

export function versionStanding(
  version: string | null,
  latest: string,
  min: string,
): VersionStanding {
  if (compareAppVersions(version, version) === null) return 'unknown';
  if (min.trim() && compareAppVersions(version, min) === -1) return 'below_min';
  if (latest.trim() && compareAppVersions(version, latest) === -1) return 'below_latest';
  return 'current';
}

/**
 * Filas de «Versiones del notificador en uso», de la más nueva a la más vieja (las
 * desconocidas al final), marcando cómo quedarían con la última versión y la mínima del
 * formulario (aunque no se haya guardado).
 */
export function notifierVersionRows(
  versions: NotifierVersionCount[],
  latest: string,
  min: string,
): NotifierVersionRow[] {
  const max = Math.max(0, ...versions.map((item) => item.count));
  return [...versions]
    .sort((a, b) => {
      const order = compareAppVersions(b.version, a.version);
      if (order !== null) return order || b.count - a.count;
      const aKnown = compareAppVersions(a.version, a.version) !== null;
      const bKnown = compareAppVersions(b.version, b.version) !== null;
      if (aKnown !== bKnown) return aKnown ? -1 : 1;
      return b.count - a.count;
    })
    .map((item) => {
      const standing = versionStanding(item.version, latest, min);
      const legacy =
        standing !== 'unknown' &&
        compareAppVersions(item.version, ANNOUNCEMENTS_MIN_APP_VERSION.notifier) === -1;
      return {
        version: item.version?.trim() || 'Sin versión',
        count: item.count,
        share: max > 0 ? Math.round((item.count / max) * 100) : 0,
        standing,
        standingLabel: STANDING[standing].label,
        tone: STANDING[standing].tone,
        legacy,
        note: legacy ? LEGACY_NOTE : STANDING[standing].note,
      };
    });
}

export interface NotifierVersionSummary {
  total: number;
  /** Ven el aviso de actualizar (1.0.10 o superior y debajo de la última). */
  seeUpdate: number;
  /** Lo ven sin poder cerrarlo (debajo de la mínima). */
  forced: number;
  /** Anteriores a 1.0.10: no ven avisos. */
  legacy: number;
}

/** Trozo del resumen: las cifras van resaltadas (mono). */
export interface SummaryPart {
  text: string;
  strong?: boolean;
}

const count = (value: number): SummaryPart => ({
  text: new Intl.NumberFormat('es-CO').format(value),
  strong: true,
});

/**
 * Resumen de «Versiones del notificador en uso» con singular y plural correctos. Con la
 * política apagada no dice que alguien vería el aviso: dice que hoy nadie lo ve y, si
 * aplica, cuántos lo verían al activarla. Los anteriores a 1.0.10 van aparte (nunca lo ven).
 */
export function notifierVersionSummaryParts(
  summary: NotifierVersionSummary,
  policyEnabled: boolean,
): SummaryPart[] {
  const parts: SummaryPart[] = [
    { text: 'De ' },
    count(summary.total),
    { text: summary.total === 1 ? ' celular, ' : ' celulares, ' },
  ];
  const forced = (): SummaryPart[] =>
    summary.forced > 0
      ? [{ text: ' (' }, count(summary.forced), { text: ' sin poder cerrarlo)' }]
      : [];

  if (!policyEnabled) {
    parts.push({
      text: 'ninguno ve el aviso de actualizar: la política del Notificador está apagada.',
    });
    if (summary.seeUpdate > 0) {
      parts.push(
        { text: ' Si la activas, ' },
        count(summary.seeUpdate),
        { text: summary.seeUpdate === 1 ? ' lo vería' : ' lo verían' },
        ...forced(),
        { text: '.' },
      );
    }
  } else if (summary.seeUpdate === 0) {
    parts.push({ text: 'ninguno vería el aviso de actualizar.' });
  } else {
    parts.push(
      count(summary.seeUpdate),
      {
        text:
          summary.seeUpdate === 1
            ? ' vería el aviso de actualizar'
            : ' verían el aviso de actualizar',
      },
      ...forced(),
      { text: '.' },
    );
  }

  if (summary.legacy > 0) {
    parts.push({ text: ' ' }, count(summary.legacy), {
      text:
        summary.legacy === 1
          ? ' tiene una versión anterior a la 1.0.10 y no ve avisos: a ese toca escribirle.'
          : ' tienen una versión anterior a la 1.0.10 y no ven avisos: a esos toca escribirles.',
    });
  }
  return parts;
}

/** El resumen como texto plano (para pruebas y lectores). */
export function summaryText(parts: SummaryPart[]): string {
  return parts.map((part) => part.text).join('');
}

export function summarizeNotifierVersions(rows: NotifierVersionRow[]): NotifierVersionSummary {
  return rows.reduce<NotifierVersionSummary>(
    (summary, row) => {
      const below = row.standing === 'below_latest' || row.standing === 'below_min';
      return {
        total: summary.total + row.count,
        seeUpdate: summary.seeUpdate + (below && !row.legacy ? row.count : 0),
        forced: summary.forced + (row.standing === 'below_min' && !row.legacy ? row.count : 0),
        legacy: summary.legacy + (row.legacy ? row.count : 0),
      };
    },
    { total: 0, seeUpdate: 0, forced: 0, legacy: 0 },
  );
}
