import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  EmptyError,
  Observable,
  catchError,
  exhaustMap,
  first,
  map,
  of,
  take,
  throwError,
  timer,
} from 'rxjs';

import { environment } from '../../../../environments/environment';
import type {
  CreateReceiptIssuerRequest,
  CreateReceiptTemplateRequest,
  ReceiptCandidatesPage,
  ReceiptCandidatesQuery,
  ReceiptCopilotJob,
  ReceiptCopilotPrompt,
  ReceiptDefinition,
  ReceiptExample,
  ReceiptExampleOrigin,
  ReceiptExamplesPage,
  ReceiptExamplesQuery,
  ReceiptFileUrl,
  ReceiptIssuer,
  ReceiptPromptKind,
  ReceiptTemplate,
  ReceiptTemplateSummary,
  ReceiptTestResult,
  UpdateReceiptExampleRequest,
  UpdateReceiptIssuerRequest,
  UpdateReceiptTemplateRequest,
} from '../../../shared/models/receipt-bank.models';

/** Cada cuánto se pregunta por un trabajo de la IA. */
export const COPILOT_POLL_INTERVAL_MS = 2500;
/** 10 minutos a 2,5 s: si el servidor reinicia, el trabajo queda `pending` para siempre. */
export const COPILOT_POLL_MAX_ATTEMPTS = 240;
export const COPILOT_TIMEOUT_MESSAGE = 'No pudimos terminar. Inténtalo de nuevo.';

/** Un trabajo de la IA terminó en error, o se venció el tiempo de espera. */
export class CopilotJobError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
  }
}

type QueryValue = string | number | boolean | undefined;

/**
 * Banco de comprobantes (solo superadmin). Va contra `/admin/receipt-bank`, que NO está en la
 * allowlist del interceptor: viaja solo con el Bearer, sin `x-business-account-id`.
 */
@Injectable({ providedIn: 'root' })
export class ReceiptBankApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin/receipt-bank`;

  // --- Emisores -------------------------------------------------------------

  listIssuers(): Observable<{ issuers: ReceiptIssuer[] }> {
    return this.http.get<{ issuers: ReceiptIssuer[] }>(`${this.baseUrl}/issuers`);
  }

  createIssuer(request: CreateReceiptIssuerRequest): Observable<{ issuer: ReceiptIssuer }> {
    return this.http.post<{ issuer: ReceiptIssuer }>(`${this.baseUrl}/issuers`, request);
  }

  updateIssuer(
    id: string,
    request: UpdateReceiptIssuerRequest,
  ): Observable<{ issuer: ReceiptIssuer }> {
    return this.http.patch<{ issuer: ReceiptIssuer }>(`${this.baseUrl}/issuers/${id}`, request);
  }

  /** Desactiva: no borra nada. Se reactiva con `updateIssuer(id, { isActive: true })`. */
  deactivateIssuer(id: string): Observable<{ issuer: ReceiptIssuer }> {
    return this.http.delete<{ issuer: ReceiptIssuer }>(`${this.baseUrl}/issuers/${id}`);
  }

  // --- Plantillas -----------------------------------------------------------

  listTemplates(issuerId: string): Observable<{ templates: ReceiptTemplateSummary[] }> {
    return this.http.get<{ templates: ReceiptTemplateSummary[] }>(
      `${this.baseUrl}/issuers/${issuerId}/templates`,
    );
  }

  createTemplate(
    issuerId: string,
    request: CreateReceiptTemplateRequest,
  ): Observable<{ template: ReceiptTemplate }> {
    return this.http.post<{ template: ReceiptTemplate }>(
      `${this.baseUrl}/issuers/${issuerId}/templates`,
      request,
    );
  }

  getTemplate(id: string): Observable<{ template: ReceiptTemplate }> {
    return this.http.get<{ template: ReceiptTemplate }>(`${this.baseUrl}/templates/${id}`);
  }

  updateTemplate(
    id: string,
    request: UpdateReceiptTemplateRequest,
  ): Observable<{ template: ReceiptTemplate }> {
    return this.http.patch<{ template: ReceiptTemplate }>(
      `${this.baseUrl}/templates/${id}`,
      request,
    );
  }

  deleteTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/templates/${id}`);
  }

  /** Corre el borrador, o lo que hay en el editor, contra los ejemplos confirmados. No guarda. */
  testTemplate(id: string, definition?: ReceiptDefinition): Observable<ReceiptTestResult> {
    return this.http.post<ReceiptTestResult>(
      `${this.baseUrl}/templates/${id}/test`,
      definition ? { definition } : {},
    );
  }

  approveTemplate(id: string): Observable<{ template: ReceiptTemplate }> {
    return this.http.post<{ template: ReceiptTemplate }>(
      `${this.baseUrl}/templates/${id}/approve`,
      {},
    );
  }

  disableTemplate(id: string): Observable<{ template: ReceiptTemplate }> {
    return this.http.post<{ template: ReceiptTemplate }>(
      `${this.baseUrl}/templates/${id}/disable`,
      {},
    );
  }

  enableTemplate(id: string): Observable<{ template: ReceiptTemplate }> {
    return this.http.post<{ template: ReceiptTemplate }>(
      `${this.baseUrl}/templates/${id}/enable`,
      {},
    );
  }

  // --- Candidatos -----------------------------------------------------------

  listCandidates(query: ReceiptCandidatesQuery = {}): Observable<ReceiptCandidatesPage> {
    return this.http.get<ReceiptCandidatesPage>(`${this.baseUrl}/candidates`, {
      params: toParams({ ...query }),
    });
  }

  candidateFileUrl(paymentSupportId: string): Observable<ReceiptFileUrl> {
    return this.http.get<ReceiptFileUrl>(
      `${this.baseUrl}/candidates/${paymentSupportId}/file-url`,
    );
  }

  // --- Ejemplos -------------------------------------------------------------

  listExamples(query: ReceiptExamplesQuery = {}): Observable<ReceiptExamplesPage> {
    return this.http.get<ReceiptExamplesPage>(`${this.baseUrl}/examples`, {
      params: toParams({ ...query }),
    });
  }

  uploadExample(
    file: File,
    origin: ReceiptExampleOrigin = {},
  ): Observable<{ example: ReceiptExample }> {
    const form = new FormData();
    form.append('file', file);
    for (const [key, value] of Object.entries(origin)) {
      if (value !== undefined) form.append(key, String(value));
    }
    return this.http.post<{ example: ReceiptExample }>(`${this.baseUrl}/examples/upload`, form);
  }

  /** Escoger un comprobante de cliente crea un borrador. Es idempotente por soporte. */
  selectCandidate(
    paymentSupportId: string,
    origin: ReceiptExampleOrigin = {},
  ): Observable<{ example: ReceiptExample; alreadySelected: boolean }> {
    return this.http.post<{ example: ReceiptExample; alreadySelected: boolean }>(
      `${this.baseUrl}/examples/from-candidate`,
      { paymentSupportId, ...origin },
    );
  }

  getExample(id: string): Observable<{ example: ReceiptExample }> {
    return this.http.get<{ example: ReceiptExample }>(`${this.baseUrl}/examples/${id}`);
  }

  updateExample(
    id: string,
    request: UpdateReceiptExampleRequest,
  ): Observable<{ example: ReceiptExample }> {
    return this.http.patch<{ example: ReceiptExample }>(`${this.baseUrl}/examples/${id}`, request);
  }

  deleteExample(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/examples/${id}`);
  }

  exampleFileUrl(id: string): Observable<ReceiptFileUrl> {
    return this.http.get<ReceiptFileUrl>(`${this.baseUrl}/examples/${id}/file-url`);
  }

  confirmExample(id: string): Observable<{ example: ReceiptExample }> {
    return this.http.post<{ example: ReceiptExample }>(
      `${this.baseUrl}/examples/${id}/confirm`,
      {},
    );
  }

  reopenExample(id: string): Observable<{ example: ReceiptExample }> {
    return this.http.post<{ example: ReceiptExample }>(`${this.baseUrl}/examples/${id}/reopen`, {});
  }

  reocrExample(id: string): Observable<{ example: ReceiptExample }> {
    return this.http.post<{ example: ReceiptExample }>(`${this.baseUrl}/examples/${id}/reocr`, {});
  }

  // --- Copiloto: propone, nunca guarda ---------------------------------------

  classifyExample(id: string): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>(`${this.baseUrl}/examples/${id}/classify`, {});
  }

  suggestRules(templateId: string): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>(
      `${this.baseUrl}/templates/${templateId}/suggest-rules`,
      {},
    );
  }

  repairRules(templateId: string): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>(
      `${this.baseUrl}/templates/${templateId}/repair-rules`,
      {},
    );
  }

  getJob<T>(jobId: string): Observable<ReceiptCopilotJob<T>> {
    return this.http.get<ReceiptCopilotJob<T>>(`${this.baseUrl}/copilot/jobs/${jobId}`);
  }

  /**
   * Sondea un trabajo hasta que termine. Emite su resultado una vez, o falla con
   * `CopilotJobError` si el trabajo dio error o se venció el límite. Una caída de red o un 5xx
   * pasajero cuenta como "sigue en curso"; el 404 (venció el trabajo) sí corta.
   */
  waitForJob<T>(
    jobId: string,
    intervalMs = COPILOT_POLL_INTERVAL_MS,
    maxAttempts = COPILOT_POLL_MAX_ATTEMPTS,
  ): Observable<T> {
    return timer(0, intervalMs).pipe(
      take(maxAttempts),
      exhaustMap(() =>
        this.getJob<T>(jobId).pipe(
          catchError((error: unknown) =>
            error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500)
              ? of(null)
              : throwError(() => error),
          ),
        ),
      ),
      first((job): job is ReceiptCopilotJob<T> => job !== null && job.status !== 'pending'),
      map((job) => {
        if (job.status === 'error' || job.result === null) {
          throw new CopilotJobError(job.errorMessage ?? COPILOT_TIMEOUT_MESSAGE, job.error);
        }
        return job.result;
      }),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof EmptyError ? new CopilotJobError(COPILOT_TIMEOUT_MESSAGE) : error,
        ),
      ),
    );
  }

  getCopilotPrompt(kind: ReceiptPromptKind): Observable<ReceiptCopilotPrompt> {
    return this.http.get<ReceiptCopilotPrompt>(`${this.baseUrl}/copilot-prompt`, {
      params: { kind },
    });
  }

  /** Vacío restaura el de por defecto. El prompt de bancos no cambia. */
  saveCopilotPrompt(kind: ReceiptPromptKind, prompt: string): Observable<{ isDefault: boolean }> {
    return this.http.put<{ isDefault: boolean }>(
      `${this.baseUrl}/copilot-prompt`,
      { prompt },
      { params: { kind } },
    );
  }
}

function toParams(query: Record<string, QueryValue>): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params = params.set(key, String(value));
  }
  return params;
}
