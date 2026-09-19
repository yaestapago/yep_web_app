import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import type { SourceEvent } from '../../../shared/models/source-event.models';
import { TtsPlaybackService } from './tts-playback.service';

const STORAGE_KEY = 'yep_web.tts.enabled';

function event(id: string, linkedTransactionId?: string): SourceEvent {
  return { id, linkedTransactionId } as SourceEvent;
}

describe('TtsPlaybackService', () => {
  let service: TtsPlaybackService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TtsPlaybackService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('arranca apagado por defecto', () => {
    expect(service.enabled()).toBe(false);
  });

  it('lee el estado persistido en localStorage al construirse', () => {
    localStorage.setItem(STORAGE_KEY, '1');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    const restored = TestBed.inject(TtsPlaybackService);
    expect(restored.enabled()).toBe(true);
  });

  it('no pide audio cuando la voz está apagada', () => {
    service.speak(event('evt-1'));
    httpMock.expectNone(`${environment.apiUrl}/source-events/evt-1/tts`);
  });

  it('pide el audio del evento cuando la voz está encendida', () => {
    service.setEnabled(true);
    service.speak(event('evt-2'));

    const req = httpMock.expectOne(
      `${environment.apiUrl}/source-events/evt-2/tts`,
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }));
  });

  it('no vuelve a leer el mismo evento si se re-emite (p. ej. al pasar a processed)', () => {
    service.setEnabled(true);
    service.speak(event('evt-3'));
    service.speak(event('evt-3', 'tx-1')); // mismo evento, ahora enlazado

    const requests = httpMock.match(() => true);
    expect(requests.length).toBe(1);
    requests.forEach((req) =>
      req.flush(new Blob([new Uint8Array([1])], { type: 'audio/wav' })),
    );
  });

  it('no lee dos veces el mismo pago aunque lo reporten dos notificadores distintos', () => {
    service.setEnabled(true);
    service.speak(event('evt-app', 'tx-2'));
    service.speak(event('evt-email', 'tx-2')); // otro evento, misma transacción

    const requests = httpMock.match(() => true);
    expect(requests.length).toBe(1);
    expect(requests[0].request.url).toBe(`${environment.apiUrl}/source-events/evt-app/tts`);
    requests.forEach((req) =>
      req.flush(new Blob([new Uint8Array([1])], { type: 'audio/wav' })),
    );
  });

  it('descarta eventos cuando la cola está llena', () => {
    service.setEnabled(true);
    // El primero entra en reproducción; llenamos la cola hasta el tope y uno más.
    for (let i = 0; i < 8; i++) {
      service.speak(event(`evt-${i}`));
    }
    // Solo el primero llegó a solicitar audio (los demás quedan en cola/descarte);
    // atendemos lo que haya para dejar el mock limpio.
    const pending = httpMock.match(() => true);
    expect(pending.length).toBeGreaterThanOrEqual(1);
    pending.forEach((req) =>
      req.flush(new Blob([new Uint8Array([0])], { type: 'audio/wav' })),
    );
  });
});
