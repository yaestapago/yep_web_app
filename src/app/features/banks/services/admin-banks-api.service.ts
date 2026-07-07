import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  AdminBankResponse,
  AdminBanksResponse,
  CreateBankRequest,
  DefaultRulesResponse,
  ParseTestRequest,
  ParseTestResponse,
  UpdateBankRequest,
} from '../../../shared/models/bank.models';

/**
 * CRUD del catálogo global de bancos (solo superadmin). Va contra `/admin/banks`,
 * que NO está en la allowlist del interceptor → viaja solo con el Bearer, sin
 * `x-business-account-id` (es config global, no de un negocio).
 */
@Injectable({ providedIn: 'root' })
export class AdminBanksApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(): Observable<AdminBanksResponse> {
    return this.http.get<AdminBanksResponse>(`${this.apiUrl}/admin/banks`);
  }

  get(code: string): Observable<AdminBankResponse> {
    return this.http.get<AdminBankResponse>(`${this.apiUrl}/admin/banks/${code}`);
  }

  create(request: CreateBankRequest): Observable<AdminBankResponse> {
    return this.http.post<AdminBankResponse>(`${this.apiUrl}/admin/banks`, request);
  }

  update(code: string, request: UpdateBankRequest): Observable<AdminBankResponse> {
    return this.http.patch<AdminBankResponse>(
      `${this.apiUrl}/admin/banks/${code}`,
      request,
    );
  }

  remove(code: string): Observable<AdminBankResponse> {
    return this.http.delete<AdminBankResponse>(`${this.apiUrl}/admin/banks/${code}`);
  }

  /** Prueba una config contra un mensaje de ejemplo (sin guardar). */
  testParse(request: ParseTestRequest): Observable<ParseTestResponse> {
    return this.http.post<ParseTestResponse>(
      `${this.apiUrl}/admin/banks/parse-test`,
      request,
    );
  }

  /** Reglas de extracción por defecto de un banco conocido (para prellenar). */
  defaultRules(code: string): Observable<DefaultRulesResponse> {
    return this.http.get<DefaultRulesResponse>(
      `${this.apiUrl}/admin/banks/${code}/default-rules`,
    );
  }
}
