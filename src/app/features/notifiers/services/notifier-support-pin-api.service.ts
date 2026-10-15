import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Estado del PIN del «modo soporte» del Notificador. El PIN nunca viaja de vuelta. */
export interface NotifierSupportPinStatus {
  configured: boolean;
  /** ISO de la última vez que se fijó; `null` si nunca. */
  updatedAt: string | null;
}

/**
 * PIN del modo soporte del Notificador (solo superadmin; ver
 * `docs/modo-soporte-notificador.md` en local-dev-env). Va contra
 * `/admin/notifier-support-pin`, config global: viaja solo con el Bearer, sin
 * `x-business-account-id`.
 */
@Injectable({ providedIn: 'root' })
export class NotifierSupportPinApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/admin/notifier-support-pin`;

  /** `GET` → `{ configured, updatedAt }`. */
  status(): Observable<NotifierSupportPinStatus> {
    return this.http.get<NotifierSupportPinStatus>(this.url);
  }

  /** `PUT { pin }` (solo dígitos, 6 a 8) → `{ configured: true, updatedAt }`. 400 si no cumple. */
  setPin(pin: string): Observable<NotifierSupportPinStatus> {
    return this.http.put<NotifierSupportPinStatus>(this.url, { pin });
  }
}
