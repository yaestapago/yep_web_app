import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { AssistantAdminApiService } from './assistant-admin-api.service';

const URL = `${environment.apiUrl}/admin/assistant`;

describe('AssistantAdminApiService (contrato · panel de Zaira)', () => {
  let service: AssistantAdminApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AssistantAdminApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GET /conversations con los filtros, sin header de negocio', () => {
    let result: unknown;
    service
      .listConversations({ flagged: true, q: '  panadería ', cursor: 'abc' })
      .subscribe((value) => (result = value));
    const req = http.expectOne((r) => r.url === `${URL}/conversations`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('flagged')).toBe('true');
    expect(req.request.params.get('q')).toBe('panadería');
    expect(req.request.params.get('cursor')).toBe('abc');
    expect(req.request.headers.has('x-business-account-id')).toBe(false);
    req.flush({ conversations: [], nextCursor: undefined });
    expect(result).toEqual({ conversations: [] });
  });

  it('manda flagged=false cuando se pide ver todas', () => {
    service.listConversations({ flagged: false }).subscribe();
    const req = http.expectOne((r) => r.url === `${URL}/conversations`);
    expect(req.request.params.get('flagged')).toBe('false');
    expect(req.request.params.has('q')).toBe(false);
    req.flush({ conversations: [] });
  });

  it('GET /conversations/:id devuelve la conversación', () => {
    let result: unknown;
    service.conversation('c1').subscribe((value) => (result = value));
    const req = http.expectOne(`${URL}/conversations/c1`);
    req.flush({ conversation: { id: 'c1', transcript: [] } });
    expect(result).toEqual({ id: 'c1', transcript: [] });
  });

  it('GET /usage con y sin mes', () => {
    service.usage().subscribe();
    http.expectOne(`${URL}/usage`).flush({});
    service.usage('2026-10').subscribe();
    const req = http.expectOne((r) => r.url === `${URL}/usage`);
    expect(req.request.params.get('month')).toBe('2026-10');
    req.flush({});
  });
});
