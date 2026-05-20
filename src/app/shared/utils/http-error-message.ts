import { HttpErrorResponse } from '@angular/common/http';

export function httpErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const backendMessage = error.error?.message;

    if (Array.isArray(backendMessage)) {
      return backendMessage.join(' ');
    }

    if (typeof backendMessage === 'string') {
      return backendMessage;
    }

    if (typeof error.error?.error === 'string') {
      return error.error.error;
    }

    if (error.status === 0) {
      return 'No fue posible conectar con el backend.';
    }
  }

  return 'Ocurrio un error inesperado.';
}
