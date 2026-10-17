import type { NotifierCaptureSmsHidden } from '../models/notifier.models';

/**
 * SMS del banco ocultos por Android 15+ (`capture.smsHidden`, notificador ≥
 * 1.0.11). Si el remitente no está en contactos, el título de la notificación
 * es el número (`85540`), Android lo toma por un código OTP y a YEP le llega
 * con el texto de redacción del sistema. Contrato:
 * `docs/sms-ocultos-android15.md` del meta-repositorio.
 */

/** Ventana de la regla: 72 h, igual que la condición `sms_hidden` del backend y la app. */
export const SMS_HIDDEN_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * - `hidden`: Android los oculta (se cumple la condición `sms_hidden`).
 * - `visible`: llegó un SMS del banco legible en las últimas 72 h.
 * - `quiet`: la app lo reporta, pero no hubo SMS del banco en las últimas 72 h.
 * - `none`: la app (< 1.0.11) o el backend no lo reportan.
 */
export type SmsHiddenState = 'hidden' | 'visible' | 'quiet' | 'none';

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Dentro de las últimas 72 h (el borde, exactamente 72 h, cuenta como reciente). */
function isRecent(value: string | null | undefined, now: number): boolean {
  const ms = parseMs(value);
  return ms !== null && ms >= now - SMS_HIDDEN_WINDOW_MS;
}

/**
 * Misma regla que la condición `sms_hidden` del backend: `lastHiddenAt` dentro
 * de las últimas 72 h y `lastReadableAt` null o anterior a hace 72 h.
 */
export function isSmsHiddenActive(
  smsHidden: NotifierCaptureSmsHidden | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!smsHidden) return false;
  return isRecent(smsHidden.lastHiddenAt, now) && !isRecent(smsHidden.lastReadableAt, now);
}

export function smsHiddenState(
  smsHidden: NotifierCaptureSmsHidden | null | undefined,
  now: number = Date.now(),
): SmsHiddenState {
  if (!smsHidden) return 'none';
  if (isSmsHiddenActive(smsHidden, now)) return 'hidden';
  if (isRecent(smsHidden.lastReadableAt, now)) return 'visible';
  return 'quiet';
}

const BOGOTA_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Bogota',
});

/** `17 de oct, 15:10` en hora de Bogotá; cadena vacía si no hay fecha válida. */
export function formatBogotaDateTime(value: string | null | undefined): string {
  const ms = parseMs(value);
  return ms === null ? '' : BOGOTA_DATE_TIME_FORMATTER.format(ms);
}
