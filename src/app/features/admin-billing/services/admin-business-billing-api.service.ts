import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type {
  AdjustCutoffPayload,
  AdjustCutoffResponse,
  BillingStatusResponse,
} from '../../../shared/models/billing-status.models';

/**
 * Cobro de UN negocio visto por superadmin ("Datos del negocio" → "Cobro y
 * fecha de corte"). A diferencia de `BillingStatusService` (store del negocio
 * activo), aquí el negocio se pasa explícito.
 */
@Injectable({ providedIn: 'root' })
export class AdminBusinessBillingApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /** `GET /subscriptions/billing-status` del negocio indicado (superadmin permitido). */
  status(businessAccountId: string): Observable<BillingStatusResponse> {
    return this.http.get<BillingStatusResponse>(`${this.apiUrl}/subscriptions/billing-status`, {
      headers: new HttpHeaders({ 'x-business-account-id': businessAccountId }),
    });
  }

  /** Mueve la fecha de corte (solo `account_su`). 400 con `message` si la fecha no es válida. */
  adjustCutoff(
    businessAccountId: string,
    payload: AdjustCutoffPayload,
  ): Observable<AdjustCutoffResponse> {
    return this.http.patch<AdjustCutoffResponse>(
      `${this.apiUrl}/admin/billing/businesses/${encodeURIComponent(businessAccountId)}/cutoff`,
      payload,
    );
  }
}
