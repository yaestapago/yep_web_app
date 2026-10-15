import { HttpErrorResponse } from '@angular/common/http';

import { httpErrorMessage } from '../../../shared/utils/http-error-message';

/**
 * Los 400 de validación del backend traen `message` como arreglo de textos: se muestran
 * uno por línea en el formulario. Cualquier otro error, como un solo texto.
 */
export function httpErrorMessages(error: unknown): string[] {
  if (error instanceof HttpErrorResponse && Array.isArray(error.error?.message)) {
    const messages = (error.error.message as unknown[]).filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );
    if (messages.length) return messages;
  }
  return [httpErrorMessage(error)];
}
