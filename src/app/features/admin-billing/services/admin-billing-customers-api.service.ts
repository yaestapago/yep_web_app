import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type { BillingCustomersResponse } from '../../../shared/models/billing-status.models';

/**
 * Vista operativa "Clientes y cobros" (solo `account_su` y `support`).
 * Va contra `/admin/billing/customers`: es una vista global de todos los
 * negocios, no depende del negocio activo.
 */
@Injectable({ providedIn: 'root' })
export class AdminBillingCustomersApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(): Observable<BillingCustomersResponse> {
    return this.http.get<BillingCustomersResponse>(`${this.apiUrl}/admin/billing/customers`);
  }
}
