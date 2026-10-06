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

function event(id: string, linkedTransactionId?: string, firstReport?: boolean): SourceEvent {
  return { id, linkedTransactionId, firstReport } as SourceEvent;
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

  describe('un pago, una sola voz', () => {
    const ttsPrefix = `${environment.apiUrl}/source-events/`;

    beforeEach(() => {
      // jsdom no reproduce audio: simulamos que cada pista termina enseguida
      // para que la cola avance y se vea TODO lo que llegaría a sonar.
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
        this: HTMLMediaElement,
      ) {
        queueMicrotask(() => this.dispatchEvent(new Event('ended')));
        return Promise.resolve();
      });
      service.setEnabled(true);
    });

    afterEach(() => vi.restoreAllMocks());

    /** Atiende todas las peticiones de audio (también las que encola la cola) y
     *  devuelve los ids de evento que sonaron, en orden. */
    async function spokenIds(): Promise<string[]> {
      const spoken: string[] = [];
      for (let round = 0; round < 20; round++) {
        const pending = httpMock.match(() => true);
        if (pending.length === 0) {
          return spoken;
        }
        for (const req of pending) {
          spoken.push(req.request.url.replace(ttsPrefix, '').replace(/\/tts$/, ''));
          req.flush(new Blob([new Uint8Array([1])], { type: 'audio/wav' }));
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return spoken;
    }

    it('received sin enlace → processed enlazado → aviso de otro notificador: suena una vez', async () => {
      service.speak(event('evt-a')); // primer emit, aún sin transacción
      service.speak(event('evt-a', 'tx-1')); // reemisión al enlazarse
      service.speak(event('evt-b', 'tx-1')); // otro notificador, mismo pago

      expect(await spokenIds()).toEqual(['evt-a']);
    });

    it('firstReport: false nunca suena (ni su reemisión posterior sin el campo)', async () => {
      service.speak(event('evt-b', 'tx-2', false));
      service.speak(event('evt-b', 'tx-2')); // reemisión por cambio de estado

      expect(await spokenIds()).toEqual([]);
    });

    it('firstReport: true suena una sola vez aunque se re-emita', async () => {
      service.speak(event('evt-a', 'tx-3', true));
      service.speak(event('evt-a', 'tx-3', true)); // entrega repetida
      service.speak(event('evt-a', 'tx-3')); // reemisión sin el campo
      service.speak(event('evt-b', 'tx-3', false)); // corroboración

      expect(await spokenIds()).toEqual(['evt-a']);
    });

    it('firstReport: true suena aunque la corroboración haya llegado antes por SSE', async () => {
      service.speak(event('evt-b', 'tx-4', false));
      service.speak(event('evt-a', 'tx-4', true));

      expect(await spokenIds()).toEqual(['evt-a']);
    });

    it('sin firstReport (backend anterior) deduplica por evento y transacción', async () => {
      service.speak(event('evt-a', 'tx-5'));
      service.speak(event('evt-b', 'tx-5')); // mismo pago, otro notificador
      service.speak(event('evt-c', 'tx-6')); // otro pago
      service.speak(event('evt-d')); // otro pago, aún sin transacción

      expect(await spokenIds()).toEqual(['evt-a', 'evt-c', 'evt-d']);
    });

    it('al encender la voz no suena tarde la reemisión de un pago que llegó con la voz apagada', async () => {
      service.setEnabled(false);
      service.speak(event('evt-a'));
      service.setEnabled(true);
      service.speak(event('evt-a', 'tx-7')); // reemisión al enlazarse
      service.speak(event('evt-b', 'tx-7')); // otro notificador

      expect(await spokenIds()).toEqual([]);
    });
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
