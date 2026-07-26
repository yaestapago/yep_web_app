import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  ConfirmBusinessDeletionResponse,
  RequestBusinessDeletionResponse,
} from '../../../shared/models/business-account.models';

/**
 * Borrado permanente de negocios (solo superadmin). Va contra
 * `/admin/businesses`, que NO está en la allowlist del interceptor → viaja
 * solo con el Bearer, sin `x-business-account-id` (mismo criterio que
 * `AdminBanksApiService`).
 */
@Injectable({ providedIn: 'root' })
export class AdminBusinessesApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  requestDeletion(
    businessAccountId: string,
    password: string,
  ): Observable<RequestBusinessDeletionResponse> {
    return this.http.post<RequestBusinessDeletionResponse>(
      `${this.apiUrl}/admin/businesses/${businessAccountId}/deletion/request`,
      { password },
    );
  }

  confirmDeletion(
    businessAccountId: string,
    code: string,
  ): Observable<ConfirmBusinessDeletionResponse> {
    return this.http.post<ConfirmBusinessDeletionResponse>(
      `${this.apiUrl}/admin/businesses/${businessAccountId}/deletion/confirm`,
      { code },
    );
  }
}
