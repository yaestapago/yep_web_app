import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  AddExampleRequest,
  AdminBankResponse,
  AdminBanksResponse,
  ChannelKey,
  CopilotPromptResponse,
  CreateBankRequest,
  ExampleRunResult,
  ExpectedValues,
  ParseTestRequest,
  ParseTestResponse,
  RecentEvent,
  SampleMessage,
  SuggestRulesResponse,
  UpdateBankRequest,
  UpdateExampleRequest,
} from '../../../shared/models/bank.models';
import type { BankChannelConfig } from '../../../shared/models/bank.models';

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

  /**
   * Sube un archivo de correo (.eml/.msg) y lo parsea a `subject`/`from`/
   * `bodyText` (texto plano real) para prellenar el probador y crear ejemplos
   * fieles al contenido que ve el backend.
   */
  parseEmailFile(file: File): Observable<{ sample: SampleMessage }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ sample: SampleMessage }>(
      `${this.apiUrl}/admin/banks/parse-email-file`,
      form,
    );
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

  /** Corre los ejemplos del banco contra su config actual (✅/❌). */
  runExamples(code: string): Observable<ExampleRunResult[]> {
    return this.http.get<ExampleRunResult[]>(
      `${this.apiUrl}/admin/banks/${code}/examples/run`,
    );
  }

  /** Eventos reales recientes del banco, para capturar como ejemplo. */
  recentEvents(code: string, channel: ChannelKey): Observable<RecentEvent[]> {
    return this.http.get<RecentEvent[]>(
      `${this.apiUrl}/admin/banks/${code}/recent-events?channel=${channel}`,
    );
  }

  /** Agrega un ejemplo curado al banco. */
  addExample(
    code: string,
    request: AddExampleRequest,
  ): Observable<AdminBankResponse> {
    return this.http.post<AdminBankResponse>(
      `${this.apiUrl}/admin/banks/${code}/examples`,
      request,
    );
  }

  /** Modifica un ejemplo guardado (el canal es inmutable). */
  updateExample(
    code: string,
    exampleId: string,
    patch: UpdateExampleRequest,
  ): Observable<AdminBankResponse> {
    return this.http.patch<AdminBankResponse>(
      `${this.apiUrl}/admin/banks/${code}/examples/${exampleId}`,
      patch,
    );
  }

  /** Elimina un ejemplo por id. */
  removeExample(code: string, exampleId: string): Observable<AdminBankResponse> {
    return this.http.delete<AdminBankResponse>(
      `${this.apiUrl}/admin/banks/${code}/examples/${exampleId}`,
    );
  }

  /** Corre los ejemplos del canal contra una config SIN guardar (la del editor). */
  testExamples(
    code: string,
    channel: ChannelKey,
    config: Partial<BankChannelConfig>,
  ): Observable<ExampleRunResult[]> {
    return this.http.post<ExampleRunResult[]>(
      `${this.apiUrl}/admin/banks/${code}/examples/test`,
      { channel, config },
    );
  }

  /** IA (on-demand): propone/repara los `parseRules` de un canal con los ejemplos. */
  suggestRules(
    code: string,
    channel: ChannelKey,
  ): Observable<SuggestRulesResponse> {
    return this.http.post<SuggestRulesResponse>(
      `${this.apiUrl}/admin/banks/${code}/suggest-rules`,
      { channel },
    );
  }

  /** IA: plantilla actual del prompt de generación de reglas (editable en caliente). */
  getCopilotPrompt(): Observable<CopilotPromptResponse> {
    return this.http.get<CopilotPromptResponse>(
      `${this.apiUrl}/admin/banks/copilot-prompt`,
    );
  }

  /** IA: guarda la plantilla del prompt (vacío = restaura la de por defecto). */
  saveCopilotPrompt(prompt: string): Observable<{ isDefault: boolean }> {
    return this.http.put<{ isDefault: boolean }>(
      `${this.apiUrl}/admin/banks/copilot-prompt`,
      { prompt },
    );
  }

  /** IA (on-demand): propone los valores esperados de un mensaje (no guarda). */
  suggestExpected(
    code: string,
    channel: ChannelKey,
    sample: SampleMessage,
  ): Observable<{ expected: ExpectedValues }> {
    return this.http.post<{ expected: ExpectedValues }>(
      `${this.apiUrl}/admin/banks/${code}/suggest-expected`,
      { channel, sample },
    );
  }
}
