import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type { SmsGatewaysResponse } from '../../../shared/models/sms-gateway.models';

/**
 * Receptores del respaldo por SMS (solo superadmin). Va contra
 * `/admin/sms-gateways`, config global: viaja solo con el Bearer, sin
 * `x-business-account-id`.
 */
@Injectable({ providedIn: 'root' })
export class SmsGatewaysAdminApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(): Observable<SmsGatewaysResponse> {
    return this.http.get<SmsGatewaysResponse>(`${this.apiUrl}/admin/sms-gateways`);
  }
}
