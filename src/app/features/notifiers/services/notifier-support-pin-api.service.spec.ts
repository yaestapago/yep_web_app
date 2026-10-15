import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { NotifierSupportPinApiService } from './notifier-support-pin-api.service';

const URL = `${environment.apiUrl}/admin/notifier-support-pin`;

describe('NotifierSupportPinApiService (contrato · modo soporte → Panel)', () => {
  let service: NotifierSupportPinApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(NotifierSupportPinApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GET /admin/notifier-support-pin', () => {
    let result: unknown;
    service.status().subscribe((value) => (result = value));
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush({ configured: false, updatedAt: null });
    expect(result).toEqual({ configured: false, updatedAt: null });
  });

  it('PUT /admin/notifier-support-pin con { pin } (solo el PIN, nada más)', () => {
    let result: unknown;
    service.setPin('20261015').subscribe((value) => (result = value));
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ pin: '20261015' });
    req.flush({ configured: true, updatedAt: '2026-10-15T15:00:00.000Z' });
    expect(result).toEqual({ configured: true, updatedAt: '2026-10-15T15:00:00.000Z' });
  });
});
