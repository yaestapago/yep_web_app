import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import {
  COPILOT_POLL_INTERVAL_MS,
  COPILOT_POLL_MAX_ATTEMPTS,
  COPILOT_TIMEOUT_MESSAGE,
  CopilotJobError,
  ReceiptBankApiService,
} from './receipt-bank-api.service';

const base = `${environment.apiUrl}/admin/receipt-bank`;
const pending = { status: 'pending', kind: 'rules', result: null, error: null, errorMessage: null };

describe('ReceiptBankApiService', () => {
  let api: ReceiptBankApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthSessionService,
          useValue: {
            accessToken: () => 'token-de-prueba',
            activeBusinessAccountId: () => 'negocio-activo',
          },
        },
      ],
    });
    api = TestBed.inject(ReceiptBankApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('va con el Bearer y sin x-business-account-id: no es dato de un negocio', () => {
    api.listIssuers().subscribe();
    const request = http.expectOne(`${base}/issuers`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-de-prueba');
    expect(request.request.headers.has('x-business-account-id')).toBe(false);
    request.flush({ issuers: [] });
  });

  it('llama a las rutas del contrato', () => {
    const calls: [() => void, string, string][] = [
      [() => api.createIssuer({ code: 'nequi', name: 'Nequi' }).subscribe(), 'POST', '/issuers'],
      [() => api.updateIssuer('i1', { isActive: true }).subscribe(), 'PATCH', '/issuers/i1'],
      [() => api.deactivateIssuer('i1').subscribe(), 'DELETE', '/issuers/i1'],
      [() => api.listTemplates('i1').subscribe(), 'GET', '/issuers/i1/templates'],
      [() => api.getTemplate('t1').subscribe(), 'GET', '/templates/t1'],
      [() => api.testTemplate('t1').subscribe(), 'POST', '/templates/t1/test'],
      [() => api.approveTemplate('t1').subscribe(), 'POST', '/templates/t1/approve'],
      [() => api.disableTemplate('t1').subscribe(), 'POST', '/templates/t1/disable'],
      [() => api.enableTemplate('t1').subscribe(), 'POST', '/templates/t1/enable'],
      [() => api.suggestRules('t1').subscribe(), 'POST', '/templates/t1/suggest-rules'],
      [() => api.repairRules('t1').subscribe(), 'POST', '/templates/t1/repair-rules'],
      [() => api.classifyExample('e1').subscribe(), 'POST', '/examples/e1/classify'],
      [() => api.selectCandidate('s1').subscribe(), 'POST', '/examples/from-candidate'],
      [() => api.candidateFileUrl('s1').subscribe(), 'GET', '/candidates/s1/file-url'],
      [() => api.exampleFileUrl('e1').subscribe(), 'GET', '/examples/e1/file-url'],
      [() => api.confirmExample('e1').subscribe(), 'POST', '/examples/e1/confirm'],
      [() => api.reopenExample('e1').subscribe(), 'POST', '/examples/e1/reopen'],
      [() => api.reocrExample('e1').subscribe(), 'POST', '/examples/e1/reocr'],
      [() => api.deleteExample('e1').subscribe(), 'DELETE', '/examples/e1'],
    ];
    for (const [call, method, path] of calls) {
      call();
      const request = http.expectOne(`${base}${path}`);
      expect(request.request.method).toBe(method);
      expect(request.request.headers.has('x-business-account-id')).toBe(false);
      request.flush({});
    }
  });

  it('el prompt lleva su tipo en la query', () => {
    api.getCopilotPrompt('classify').subscribe();
    http.expectOne(`${base}/copilot-prompt?kind=classify`).flush({});
    api.saveCopilotPrompt('rules', '').subscribe();
    const put = http.expectOne(`${base}/copilot-prompt?kind=rules`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ prompt: '' });
    put.flush({ isDefault: true });
  });

  it('solo manda los filtros de candidatos que tienen valor', () => {
    api
      .listCandidates({ issuerHint: 'Nequi', onlyUnselected: true, accountId: undefined, cursor: 'c2' })
      .subscribe();
    const request = http.expectOne((req) => req.url === `${base}/candidates`);
    expect(request.request.params.keys().sort()).toEqual(['cursor', 'issuerHint', 'onlyUnselected']);
    expect(request.request.params.get('onlyUnselected')).toBe('true');
    request.flush({ candidates: [], nextCursor: null });
  });

  it('sube el archivo como multipart, sin campos vacíos', () => {
    const file = new File(['x'], 'comprobante.png', { type: 'image/png' });
    api.uploadExample(file, { issuerId: 'i1', templateId: undefined }).subscribe();
    const request = http.expectOne(`${base}/examples/upload`);
    const form = request.request.body as FormData;
    expect(form.get('file')).toBeInstanceOf(File);
    expect(form.get('issuerId')).toBe('i1');
    expect(form.has('templateId')).toBe(false);
    request.flush({ example: {} });
  });

  describe('waitForJob', () => {
    beforeEach(() => vi.useFakeTimers());

    it('sigue preguntando mientras esté pendiente y emite el resultado una vez', async () => {
      const next = vi.fn();
      const complete = vi.fn();
      api.waitForJob('j1').subscribe({ next, complete });

      await vi.advanceTimersByTimeAsync(0);
      http.expectOne(`${base}/copilot/jobs/j1`).flush(pending);
      expect(next).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(COPILOT_POLL_INTERVAL_MS);
      http
        .expectOne(`${base}/copilot/jobs/j1`)
        .flush({ ...pending, status: 'done', result: { allPass: true } });

      expect(next).toHaveBeenCalledWith({ allPass: true });
      expect(complete).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(COPILOT_POLL_INTERVAL_MS * 3);
      http.expectNone(`${base}/copilot/jobs/j1`);
    });

    it('un trabajo en error falla con su errorMessage', async () => {
      const error = vi.fn();
      api.waitForJob('j1').subscribe({ error });
      await vi.advanceTimersByTimeAsync(0);
      http.expectOne(`${base}/copilot/jobs/j1`).flush({
        ...pending,
        status: 'error',
        error: 'anonymization_failed',
        errorMessage: 'Revisa que los labels no traigan un dato real.',
      });

      const failure = error.mock.calls[0][0] as CopilotJobError;
      expect(failure).toBeInstanceOf(CopilotJobError);
      expect(failure.code).toBe('anonymization_failed');
      expect(failure.message).toBe('Revisa que los labels no traigan un dato real.');
    });

    it('se detiene al vencer el límite: un trabajo perdido no se sondea para siempre', async () => {
      const error = vi.fn();
      api.waitForJob('j1', 100, 3).subscribe({ error });

      for (let attempt = 0; attempt < 3; attempt++) {
        await vi.advanceTimersByTimeAsync(attempt === 0 ? 0 : 100);
        http.expectOne(`${base}/copilot/jobs/j1`).flush(pending);
      }
      await vi.advanceTimersByTimeAsync(100);

      expect((error.mock.calls[0][0] as Error).message).toBe(COPILOT_TIMEOUT_MESSAGE);
      await vi.advanceTimersByTimeAsync(1000);
      http.expectNone(`${base}/copilot/jobs/j1`);
    });

    it('el límite por defecto son 10 minutos', () => {
      expect(COPILOT_POLL_INTERVAL_MS * COPILOT_POLL_MAX_ATTEMPTS).toBe(10 * 60 * 1000);
    });

    it('una falla pasajera del servidor no corta el sondeo', async () => {
      const next = vi.fn();
      const error = vi.fn();
      api.waitForJob('j1').subscribe({ next, error });

      await vi.advanceTimersByTimeAsync(0);
      http
        .expectOne(`${base}/copilot/jobs/j1`)
        .flush({}, { status: 502, statusText: 'Bad Gateway' });
      expect(error).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(COPILOT_POLL_INTERVAL_MS);
      http.expectOne(`${base}/copilot/jobs/j1`).flush({ ...pending, status: 'done', result: {} });
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('el 404 sí corta: el trabajo venció', async () => {
      const error = vi.fn();
      api.waitForJob('j1').subscribe({ error });
      await vi.advanceTimersByTimeAsync(0);
      http
        .expectOne(`${base}/copilot/jobs/j1`)
        .flush({ message: 'No existe' }, { status: 404, statusText: 'Not Found' });
      expect(error.mock.calls[0][0]).toBeInstanceOf(HttpErrorResponse);
    });
  });
});
