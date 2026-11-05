import { HttpErrorResponse } from '@angular/common/http';

import type {
  ReceiptApprovalBlocker,
  ReceiptExpectedValues,
  ReceiptFallbackReason,
  ReceiptFieldKey,
  ReceiptFieldTestStatus,
  ReceiptMedium,
  ReceiptTemplateKind,
  ReceiptTemplateStatus,
  ReceiptValueFormat,
} from '../../../shared/models/receipt-bank.models';
import type { SelectOption } from '../../../shared/ui/select/select';
import type { StatusChipTone } from '../../../shared/ui/status-chip/status-chip';
import { httpErrorMessage } from '../../../shared/utils/http-error-message';
import { formatCop } from '../../assistant-admin/utils/assistant-admin-labels';

export const FIELD_LABELS: Record<ReceiptFieldKey, string> = {
  amount: 'Monto',
  currency: 'Moneda',
  dateTime: 'Fecha y hora',
  reference: 'Referencia',
  senderName: 'Nombre de quien envía',
  senderAccount: 'Cuenta de quien envía',
  receiverName: 'Nombre de quien recibe',
  receiverAccount: 'Cuenta de destino',
  llave: 'Llave',
  status: 'Estado del pago',
  kind: 'Tipo de movimiento',
};

export const VALUE_FORMAT_LABELS: Record<ReceiptValueFormat, string> = {
  money: 'Dinero',
  datetime: 'Fecha y hora',
  date: 'Solo fecha',
  account: 'Cuenta',
  phone: 'Celular',
  name: 'Nombre',
  reference: 'Referencia',
  text: 'Texto',
};

export const TEMPLATE_KIND_LABELS: Record<ReceiptTemplateKind, string> = {
  same_bank_transfer: 'Transferencia al mismo banco',
  other_bank_transfer: 'Transferencia a otro banco',
  bre_b: 'Bre-B',
  qr_payment: 'Pago con QR',
  pse: 'PSE',
  deposit: 'Consignación',
  other: 'Otro',
};

export const MEDIUM_LABELS: Record<ReceiptMedium, string> = {
  app_screenshot: 'Pantallazo de la app',
  pdf: 'PDF',
  other: 'Otro',
};

export const FALLBACK_REASON_LABELS: Record<ReceiptFallbackReason, string> = {
  mode_off: 'Lectura por reglas apagada',
  re2_unavailable: 'Sin motor de reglas',
  no_templates: 'Sin plantillas aprobadas',
  no_match: 'No reconocimos el comprobante',
  ambiguous_match: 'Coincidió con varias plantillas',
  rule_error: 'Una regla falló',
  incomplete: 'Faltaron datos',
  invalid_value: 'Un dato no fue válido',
};

export const STATUS_VALUE_OPTIONS: SelectOption[] = [
  { id: 'success', label: 'Exitoso' },
  { id: 'pending', label: 'Pendiente' },
  { id: 'failed', label: 'Fallido' },
];

function optionsFrom<K extends string>(labels: Record<K, string>): SelectOption[] {
  return (Object.entries(labels) as [K, string][]).map(([id, label]) => ({ id, label }));
}

export const FIELD_OPTIONS = optionsFrom(FIELD_LABELS);
export const VALUE_FORMAT_OPTIONS = optionsFrom(VALUE_FORMAT_LABELS);
export const TEMPLATE_KIND_OPTIONS = optionsFrom(TEMPLATE_KIND_LABELS);
export const MEDIUM_OPTIONS = optionsFrom(MEDIUM_LABELS);
export const FALLBACK_REASON_OPTIONS = optionsFrom(FALLBACK_REASON_LABELS);

export const FIELD_TEST_LABELS: Record<ReceiptFieldTestStatus, string> = {
  ok: '✅ Coincide',
  mismatch: '❌ No coincide',
  missing: '❌ No lo leyó',
  unexpected: '❌ Leyó algo que no aparece',
  not_checked: 'Sin revisar',
};

const BLOCKER_MESSAGES: Record<ReceiptApprovalBlocker, string> = {
  invalid_rules: 'Hay reglas vacías o no válidas, o un dato requerido sin regla.',
  weak_detection:
    'La detección es débil: necesita al menos 2 señales entre "Debe contener todos" y la cantidad mínima de "Debe contener alguno".',
  no_required_fields: 'Marca al menos un dato como requerido.',
  too_few_examples: 'Faltan ejemplos: necesitas al menos 3 confirmados de este tipo de comprobante.',
  examples_failing: 'Hay ejemplos en ❌. Corrige las reglas o los valores esperados y vuelve a probar.',
  collisions:
    'Se cruza con otra plantilla aprobada: reconoce un comprobante que ya es de ella. Ajusta la detección.',
  re2_unavailable:
    'El servidor no tiene instalado el motor RE2, y sin él no podemos garantizar que las reglas sean seguras. Esto no se arregla desde aquí: avísale al equipo técnico.',
};

export function blockerMessage(blocker: string): string {
  return (
    BLOCKER_MESSAGES[blocker as ReceiptApprovalBlocker] ??
    'Hay algo que impide aprobar esta plantilla. Revísala con el equipo técnico.'
  );
}

export interface TemplateStatusChip {
  label: string;
  tone: StatusChipTone;
}

export function templateStatusChips(
  status: ReceiptTemplateStatus,
  hasUnapprovedChanges: boolean,
): TemplateStatusChip[] {
  const main: Record<ReceiptTemplateStatus, TemplateStatusChip> = {
    draft: { label: 'Borrador', tone: 'neutral' },
    approved: { label: 'Aprobada', tone: 'success' },
    disabled: { label: 'Desactivada', tone: 'warning' },
  };
  return hasUnapprovedChanges
    ? [main[status], { label: 'Cambios sin aprobar', tone: 'info' }]
    : [main[status]];
}

/** Un comprobante en PDF no se puede pintar en un `<img>`. */
export function isPdfMime(mimeType: string | null | undefined): boolean {
  return (mimeType ?? '').trim().toLowerCase() === 'application/pdf';
}

/** Mismo criterio del backend: un código en minúsculas, sin espacios. */
export const RECEIPT_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Una línea por valor, sin vacíos ni repetidos. */
export function linesToList(text: string): string[] {
  return [
    ...new Set(
      text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

// --- Monto ------------------------------------------------------------------

const PLAIN_INTEGER = /^[1-9]\d*$/;
const GROUPED_INTEGER = /^[1-9]\d{0,2}([.,])\d{3}(?:\1\d{3})*$/;
const WITH_CENTS = /^(.+)([.,])(\d{1,2})$/;
/** "48.00" o "48,5" suelen ser $ 48.000 o $ 48.500 mal escritos: no se adivinan. */
const MIN_INTEGER_WITH_CENTS = 1000;

function wholePesos(text: string): number | null {
  if (!PLAIN_INTEGER.test(text) && !GROUPED_INTEGER.test(text)) return null;
  const value = Number(text.replace(/[.,]/g, ''));
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Monto escrito a mano como lo lee el backend (`parseCopAmount`): el punto es de miles, así que
 * "50.000" es 50000 y nunca 50. Lo ambiguo, como "48.00", devuelve `null`: no se adivina.
 */
export function parseCopAmountInput(raw: string): number | null {
  const text = raw.replace(/\$|cop/gi, ' ').trim();
  const whole = wholePesos(text);
  if (whole !== null) return whole;

  const withCents = text.match(WITH_CENTS);
  if (!withCents) return null;
  const [, integerText, separator, cents] = withCents;
  if (integerText.includes(separator)) return null;
  const integer = wholePesos(integerText);
  if (integer === null || integer < MIN_INTEGER_WITH_CENTS) return null;
  return Number(`${integer}.${cents}`);
}

// --- Fecha ------------------------------------------------------------------

const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;
const COLOMBIAN_DAY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const COLOMBIAN_12H = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i;
const COLOMBIAN_24H = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;

const pad = (value: number): string => String(value).padStart(2, '0');

function buildLocal(
  year: number,
  month: number,
  day: number,
  hour?: number,
  minute = 0,
): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const dayText = `${year}-${pad(month)}-${pad(day)}`;
  if (hour === undefined) return dayText;
  if (hour > 23 || minute > 59) return null;
  return `${dayText}T${pad(hour)}:${pad(minute)}`;
}

/**
 * Fecha esperada como la pide el backend: hora de Bogotá sin desfase (`2026-11-05T14:30`) o solo
 * el día. Se escribe como en el comprobante: `05/11/2026 2:30 pm`. El primer número es el día.
 */
export function parseExpectedDate(raw: string): string | null {
  const text = raw.trim();
  const iso = text.match(ISO_LOCAL);
  if (iso) {
    return buildLocal(
      +iso[1],
      +iso[2],
      +iso[3],
      iso[4] === undefined ? undefined : +iso[4],
      iso[5] === undefined ? 0 : +iso[5],
    );
  }
  const day = text.match(COLOMBIAN_DAY);
  if (day) return buildLocal(+day[3], +day[2], +day[1]);

  const h24 = text.match(COLOMBIAN_24H);
  if (h24) return buildLocal(+h24[3], +h24[2], +h24[1], +h24[4], +h24[5]);

  const h12 = text.match(COLOMBIAN_12H);
  if (!h12) return null;
  const hour12 = +h12[4];
  if (hour12 < 1 || hour12 > 12) return null;
  const hour = (hour12 % 12) + (h12[6].toLowerCase() === 'p' ? 12 : 0);
  return buildLocal(+h12[3], +h12[2], +h12[1], hour, h12[5] === undefined ? 0 : +h12[5]);
}

/** `2026-11-05T14:30` → `05/11/2026 2:30 pm`. Si no lo reconoce, lo devuelve igual. */
export function formatExpectedDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return value;
  const [, year, month, day, hourText, minute] = match;
  const dayText = `${day}/${month}/${year}`;
  if (hourText === undefined) return dayText;
  const hour = +hourText;
  return `${dayText} ${hour % 12 || 12}:${minute} ${hour < 12 ? 'am' : 'pm'}`;
}

/** Un valor esperado u obtenido, para mostrarlo con el formato de la marca. */
export function formatFieldValue(key: ReceiptFieldKey, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'amount') {
    const amount = typeof value === 'number' ? value : parseCopAmountInput(String(value));
    return amount === null ? String(value) : formatCop(amount);
  }
  if (key === 'dateTime') return formatExpectedDate(String(value));
  return String(value);
}

/** Lo que muestra el input de un dato ya guardado. */
export function expectedToInput(
  key: ReceiptFieldKey,
  expected: ReceiptExpectedValues | null,
): string {
  const value = expected?.[key];
  if (value === null || value === undefined) return '';
  if (key === 'amount' && typeof value === 'number') {
    // Con centavos no se redondea: al guardar de nuevo cambiaría el valor.
    return `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value)}`;
  }
  return key === 'amount' || key === 'dateTime' ? formatFieldValue(key, value) : String(value);
}

// --- Errores ----------------------------------------------------------------

/** Texto para un error al pedirle algo a la IA: el 503 es falta de llave, no un fallo. */
export function copilotErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.status === 503
      ? 'La IA no está configurada en este ambiente. Puedes hacerlo a mano.'
      : httpErrorMessage(error);
  }
  return error instanceof Error ? error.message : httpErrorMessage(error);
}
