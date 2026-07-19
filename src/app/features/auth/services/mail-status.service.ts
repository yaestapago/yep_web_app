import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, of, tap } from 'rxjs';

import { MailStatusResponse } from '../../../shared/models/auth.models';
import { AuthApiService } from './auth-api.service';

/**
 * Estado de SES/correo transaccional (`GET /auth/mail-status`), consultado
 * por las páginas de registro/login/recuperación para ocultar los pasos que
 * dependen de correo cuando el backend lo tiene deshabilitado
 * (`MAIL_DISABLED` o sin `MAIL_FROM_EMAIL`). Se cachea en memoria: una sola
 * llamada HTTP por sesión de navegación, compartida entre páginas.
 *
 * Por defecto asume `enabled = true` (mantiene el flujo con verificación)
 * hasta que la respuesta llegue, para no exponer accidentalmente el bypass
 * si la consulta falla o tarda.
 */
@Injectable({ providedIn: 'root' })
export class MailStatusService {
  private readonly authApi = inject(AuthApiService);

  private readonly status = signal<MailStatusResponse | null>(null);
  private loaded = false;

  readonly enabled = computed(() => this.status()?.enabled ?? true);

  ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;

    this.authApi
      .getMailStatus()
      .pipe(
        tap((response) => this.status.set(response)),
        catchError(() => {
          this.loaded = false;
          return of(null);
        }),
      )
      .subscribe();
  }
}
