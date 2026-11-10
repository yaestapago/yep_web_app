import { HttpErrorResponse } from '@angular/common/http';

import { httpErrorMessage } from '../../../shared/utils/http-error-message';

/** Lo que acepta `POST /extraction/ocr` en la web: sin PDF, hasta 10 MB. */
export const RECEIPT_OCR_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/jpg', 'image/png'];
export const RECEIPT_OCR_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_OCR_ACCEPT = 'image/jpeg,image/png';

export const UNSUPPORTED_RECEIPT_MESSAGE =
  'No podemos leer este archivo. Sube una foto o un pantallazo en JPG o PNG de hasta 10 MB.';

export const RECEIPT_PHOTO_NOT_SAVED_MESSAGE =
  'Los datos del pago quedaron guardados, pero la foto del comprobante no. Si cambiaste de negocio mientras lo leías, vuelve a capturarlo desde el negocio correcto.';

/** Mismo texto del backend al rechazar una `file.key` fuera de `receipts/{accountId}/`. */
const INVALID_FILE_KEY_MESSAGE = 'Clave de archivo no válida';

/** `null` si el archivo se puede enviar al OCR; si no, el aviso para mostrar. */
export function receiptFileProblem(file: File): string | null {
  const type = file.type.trim().toLowerCase();
  if (!RECEIPT_OCR_MIME_TYPES.includes(type) || file.size > RECEIPT_OCR_MAX_BYTES) {
    return UNSUPPORTED_RECEIPT_MESSAGE;
  }
  return null;
}

interface PlanLimitBody {
  code?: string;
  reason?: 'not_included' | 'exhausted' | 'suspended';
  message?: string;
}

/**
 * Texto para un error de `POST /extraction/ocr`. El 403 `PLAN_LIMIT_REACHED` es el
 * cupo de lecturas: [canManagePlan] dice si quien lo ve puede cambiar el plan.
 */
export function receiptOcrErrorMessage(error: unknown, canManagePlan: boolean): string {
  if (!(error instanceof HttpErrorResponse)) {
    return httpErrorMessage(error);
  }

  const body = (error.error ?? null) as PlanLimitBody | null;
  if (error.status === 403 && body?.code === 'PLAN_LIMIT_REACHED') {
    return planLimitMessage(body, canManagePlan);
  }
  // 400: archivo ausente, de otro tipo o de más de 10 MB. 413: lo cortó la subida.
  if (error.status === 400 || error.status === 413) {
    return UNSUPPORTED_RECEIPT_MESSAGE;
  }
  // 502: Textract u OpenAI no pudieron con la imagen. No se nombra el proveedor.
  if (error.status === 502) {
    return 'No pudimos leer el comprobante. Prueba con una foto más nítida o vuelve a intentarlo.';
  }
  return httpErrorMessage(error);
}

function planLimitMessage(body: PlanLimitBody, canManagePlan: boolean): string {
  switch (body.reason) {
    case 'not_included':
      return canManagePlan
        ? 'Tu plan no incluye la lectura de comprobantes. Puedes cambiarlo en Suscripción.'
        : 'El plan de tu negocio no incluye la lectura de comprobantes. Pídele al dueño que lo cambie.';
    case 'exhausted':
      return canManagePlan
        ? 'Ya usaste las lecturas de comprobantes de este mes. Puedes ampliar tu plan en Suscripción.'
        : 'Tu negocio ya usó las lecturas de comprobantes de este mes. Pídele al dueño que amplíe el plan.';
    case 'suspended':
      return canManagePlan
        ? 'La lectura de comprobantes está pausada por un pago pendiente. Ponte al día en Suscripción.'
        : 'La lectura de comprobantes está pausada por un pago pendiente. Avísale al dueño del negocio.';
    default:
      return body.message?.trim() || 'Tu plan no permite leer más comprobantes por ahora.';
  }
}

/** 400 de `POST /transactions/:id/supports` porque la clave no es de este negocio. */
export function isInvalidFileKeyError(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 400 &&
    error.error?.message === INVALID_FILE_KEY_MESSAGE
  );
}
