import { HttpEventType, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { AssistantChatService, assistantMenu } from './assistant-chat.service';

const BASE = `${environment.apiUrl}/assistant`;
const JSON_URL = `${BASE}/messages`;
const STREAM_URL = `${BASE}/messages/stream`;
const SUGGESTIONS_URL = `${BASE}/suggestions`;
const FEEDBACK_URL = `${BASE}/feedback`;
const STORAGE_KEY = 'yep-zaira-conversation:usuario-1:negocio-1';

/** Responde por el stream como lo hace el backend: una línea por evento y cierra. */
function flushDone(request: TestRequest, reply: object): void {
  request.flush(`data: ${JSON.stringify({ t: 'done', ...reply })}\n\n`);
}

function chunk(request: TestRequest, partialText: string): void {
  request.event({
    type: HttpEventType.DownloadProgress,
    loaded: partialText.length,
    partialText,
  });
}

describe('AssistantChatService (chat con Zaira)', () => {
  let service: AssistantChatService;
  let http: HttpTestingController;
  const activeBusinessAccountId = signal<string | null>('negocio-1');
  const user = signal<{ id: string } | null>({ id: 'usuario-1' });
  const routerUrl = { url: '/' };

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthSessionService, useValue: { activeBusinessAccountId, user } },
        { provide: Router, useValue: routerUrl },
      ],
    });
    service = TestBed.inject(AssistantChatService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  }

  beforeEach(() => {
    localStorage.clear();
    activeBusinessAccountId.set('negocio-1');
    user.set({ id: 'usuario-1' });
    routerUrl.url = '/';
    setup();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    http.verify();
  });

  describe('preguntar', () => {
    it('manda la pregunta con el negocio activo y continúa la misma conversación', () => {
      service.send('  ¿Cuáles son los precios?  ');
      const first = http.expectOne(STREAM_URL);
      expect(first.request.method).toBe('POST');
      expect(first.request.headers.get('x-business-account-id')).toBe('negocio-1');
      expect(first.request.body).toEqual({ message: '¿Cuáles son los precios?' });
      expect(service.sending()).toBe(true);
      flushDone(first, {
        conversationId: 'conv-1',
        reply: 'El plan **Basic** vale $ 30.000 al mes.',
      });

      expect(service.sending()).toBe(false);
      expect(service.messages().map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(service.messages()[1].blocks[0]).toEqual({
        type: 'p',
        parts: [
          { text: 'El plan ' },
          { text: 'Basic', bold: true },
          { text: ' vale ' },
          { text: '$ 30.000', mono: true },
          { text: ' al mes.' },
        ],
      });

      service.send('¿Y el anual?');
      const second = http.expectOne(STREAM_URL);
      expect(second.request.body).toEqual({ message: '¿Y el anual?', conversationId: 'conv-1' });
      flushDone(second, { conversationId: 'conv-1', reply: 'Pagas 10 meses y recibes 12.' });
    });

    it('las preguntas del menú viajan con su presetId', () => {
      service.send('¿Cuáles son los precios?', { presetId: 'precios' });
      const req = http.expectOne(STREAM_URL);
      expect(req.request.body).toEqual({
        message: '¿Cuáles son los precios?',
        presetId: 'precios',
      });
      flushDone(req, { conversationId: 'conv-1', reply: 'Estos son los planes de YEP…' });
    });

    it('manda la pantalla abierta; si no la conoce, no manda nada', () => {
      routerUrl.url = '/businesses/negocio-1/notifiers?x=1';
      service.send('¿Cómo agrego uno?');
      const req = http.expectOne(STREAM_URL);
      expect(req.request.body.page).toBe('notifiers');
      flushDone(req, { conversationId: 'conv-1', reply: 'Toca "Nuevo notificador".' });

      routerUrl.url = '/__ops/assistant';
      service.send('Hola');
      const other = http.expectOne(STREAM_URL);
      expect(other.request.body.page).toBeUndefined();
      flushDone(other, { conversationId: 'conv-1', reply: '¡Hola!' });
    });

    it('no manda preguntas vacías ni dos a la vez', () => {
      service.send('   ');
      http.expectNone(STREAM_URL);

      service.send('Hola');
      service.send('Otra');
      const requests = http.match(STREAM_URL);
      expect(requests).toHaveLength(1);
      flushDone(requests[0], { conversationId: 'conv-1', reply: '¡Hola!' });
    });

    it('al cambiar de negocio vuelve al menú y empieza otra conversación', () => {
      service.send('Hola');
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: '¡Hola!' });
      service.draft.set('a medio escribir');

      activeBusinessAccountId.set('negocio-2');
      TestBed.tick();
      expect(service.messages()).toEqual([]);
      expect(service.draft()).toBe('');

      service.send('Hola de nuevo');
      const req = http.expectOne(STREAM_URL);
      expect(req.request.headers.get('x-business-account-id')).toBe('negocio-2');
      expect(req.request.body.conversationId).toBeUndefined();
      flushDone(req, { conversationId: 'conv-2', reply: '¡Hola!' });
    });

    it('guarda los campos nuevos de la respuesta y descarta lo que no entiende', () => {
      service.send('Hola');
      flushDone(http.expectOne(STREAM_URL), {
        conversationId: 'conv-1',
        reply: 'Listo.',
        turn: 3,
        kind: 'answer',
        actions: [
          { type: 'open_route', label: 'Abrir Notificadores', route: 'notifiers' },
          { type: 'open_route', label: 'Ruta falsa', route: 'https://evil.co' },
          { type: 'otra', label: 'Otra', route: 'home' },
          { type: 'open_route', label: 'Ver mi plan', route: 'subscription' },
          { type: 'open_route', label: 'Sobra', route: 'home' },
        ],
        followUps: [
          { label: 'Uno', presetId: 'precios' },
          { label: 'Dos' },
          { label: '' },
          { label: 'Tres' },
          { label: 'Cuatro' },
        ],
        offerSupport: true,
        supportText: 'Hola, soporte.',
      });

      const last = service.messages().at(-1)!;
      expect(last.turn).toBe(3);
      expect(last.conversationId).toBe('conv-1');
      expect(last.actions?.map((a) => a.label)).toEqual(['Abrir Notificadores', 'Ver mi plan']);
      expect(last.followUps?.map((f) => f.label)).toEqual(['Uno', 'Dos', 'Tres']);
      expect(last.offerSupport).toBe(true);
      expect(last.supportText).toBe('Hola, soporte.');
    });

    it('con un backend viejo la respuesta se entiende con solo `reply`', () => {
      service.send('Hola');
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: '¡Hola!' });
      const last = service.messages().at(-1)!;
      expect(last.turn).toBeUndefined();
      expect(last.actions).toBeUndefined();
      expect(last.followUps).toBeUndefined();
    });

    it('el tope alcanzado se distingue de una respuesta normal', () => {
      service.send('Hola');
      flushDone(http.expectOne(STREAM_URL), {
        conversationId: 'conv-1',
        reply: 'Este mes tu negocio ya usó…',
        kind: 'budget_reached',
        offerSupport: true,
      });
      expect(service.budgetReached()).toBe(true);

      service.reset();
      expect(service.budgetReached()).toBe(false);
    });
  });

  describe('progreso real por el stream', () => {
    it('muestra lo que está revisando y termina con la respuesta', () => {
      service.send('¿Cómo van mis notificadores?');
      const req = http.expectOne(STREAM_URL);
      expect(req.request.responseType).toBe('text');
      expect(req.request.reportProgress).toBe(true);

      let text = ': ping\n\ndata: {"t":"status","label":"Revisando tus notificadores…"}\n\n';
      chunk(req, text);
      expect(service.progress()).toBe('Revisando tus notificadores…');
      expect(service.sending()).toBe(true);

      text += 'data: {"t":"status","label":"Buscando en tus pagos…"}\n\n';
      chunk(req, text);
      expect(service.progress()).toBe('Buscando en tus pagos…');

      text += 'data: {"t":"done","conversationId":"conv-1","reply":"Todo bien.","turn":1}\n\n';
      chunk(req, text);
      expect(service.sending()).toBe(false);
      expect(service.progress()).toBeNull();
      expect(service.messages().at(-1)?.turn).toBe(1);
      expect(req.cancelled).toBe(true);
    });

    it('un error dentro del stream se muestra igual que por HTTP y no se repite', () => {
      service.send('Hola');
      const req = http.expectOne(STREAM_URL);
      chunk(
        req,
        '{"t":"error","status":429,"error":"ASSISTANT_RATE_LIMITED","message":"Vas muy rápido.","retryAfterSeconds":120}\n',
      );
      http.expectNone(JSON_URL);

      const last = service.messages().at(-1)!;
      expect(last.error).toBe(true);
      expect(last.blocks).toEqual([{ type: 'p', parts: [{ text: 'Vas muy rápido.' }] }]);
      expect(last.retryWait).toBe('Puedes intentar en 2 min.');
    });

    it('sin evento de progreso, los textos van por tiempo', () => {
      vi.useFakeTimers();
      service.send('Hola');
      const req = http.expectOne(STREAM_URL);
      expect(service.progress()).toBeNull();

      vi.advanceTimersByTime(8000);
      expect(service.progress()).toBe('Sigo revisando…');
      vi.advanceTimersByTime(17000);
      expect(service.progress()).toBe('Esto está tardando más de lo normal.');

      flushDone(req, { conversationId: 'conv-1', reply: 'Listo.' });
      expect(service.progress()).toBeNull();
    });

    it('un estado real reemplaza a los textos por tiempo', () => {
      vi.useFakeTimers();
      service.send('Hola');
      const req = http.expectOne(STREAM_URL);

      vi.advanceTimersByTime(5000);
      const status = '{"t":"status","label":"Mirando tu plan…"}\n';
      chunk(req, status);
      vi.advanceTimersByTime(10000);
      expect(service.progress()).toBe('Mirando tu plan…');

      // El cuerpo final trae todo lo recibido, como en el navegador.
      req.flush(`${status}{"t":"done","conversationId":"conv-1","reply":"Listo."}\n`);
      expect(service.messages().at(-1)?.error).toBeUndefined();
    });

    it('a los 120 s corta, avisa y ofrece reintentar', () => {
      vi.useFakeTimers();
      service.send('Hola');
      const req = http.expectOne(STREAM_URL);

      vi.advanceTimersByTime(120_000);
      expect(req.cancelled).toBe(true);
      expect(service.sending()).toBe(false);
      const last = service.messages().at(-1)!;
      expect(last.error).toBe(true);
      expect(last.blocks).toEqual([
        { type: 'p', parts: [{ text: 'Zaira se demoró demasiado. Intenta de nuevo.' }] },
      ]);
      expect(last.retry?.text).toBe('Hola');
    });
  });

  describe('respaldo por el endpoint JSON', () => {
    it('un 401 del stream se repite por JSON, donde el interceptor sí renueva el token', () => {
      service.send('Hola');
      http
        .expectOne(STREAM_URL)
        .flush(JSON.stringify({ message: 'Token de autenticación inválido' }), {
          status: 401,
          statusText: 'Unauthorized',
        });

      const req = http.expectOne(JSON_URL);
      expect(req.request.body).toEqual({ message: 'Hola' });
      expect(req.request.responseType).toBe('json');
      req.flush({ conversationId: 'conv-1', reply: '¡Hola!' });
      expect(service.messages().at(-1)?.error).toBeUndefined();

      // El 401 fue del token, no del endpoint: la siguiente vuelve a intentar con progreso.
      service.send('Otra');
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: 'Listo.' });
    });

    it('un 402 se repite por JSON para que el interceptor lleve a la pantalla de bloqueo', () => {
      service.send('Hola');
      http.expectOne(STREAM_URL).flush(JSON.stringify({ error: 'BUSINESS_BILLING_BLOCKED' }), {
        status: 402,
        statusText: 'Payment Required',
      });
      http
        .expectOne(JSON_URL)
        .flush(
          { error: 'BUSINESS_BILLING_BLOCKED' },
          { status: 402, statusText: 'Payment Required' },
        );
      expect(service.messages().at(-1)?.error).toBe(true);
    });

    it('con un backend viejo (404) usa JSON y no vuelve a intentar el stream', () => {
      service.send('Hola');
      http.expectOne(STREAM_URL).flush('{"message":"Cannot POST"}', {
        status: 404,
        statusText: 'Not Found',
      });
      http.expectOne(JSON_URL).flush({ conversationId: 'conv-1', reply: '¡Hola!' });
      expect(service.messages().at(-1)?.error).toBeUndefined();

      service.send('Otra');
      http.expectNone(STREAM_URL);
      http.expectOne(JSON_URL).flush({ conversationId: 'conv-1', reply: 'Listo.' });
    });

    it('un corte de red a mitad de la respuesta no repite la pregunta sola', () => {
      service.send('¿Me llegó el pago?');
      const req = http.expectOne(STREAM_URL);
      chunk(req, 'data: {"t":"status","label":"Buscando en tus pagos…"}\n\n');
      req.error(new ProgressEvent('error'));

      // El turno pudo llegar y seguir corriendo en el servidor: repetirla lo pagaría dos veces.
      http.expectNone(JSON_URL);
      http.expectNone(STREAM_URL);
      const last = service.messages().at(-1)!;
      expect(last.error).toBe(true);
      expect(last.blocks).toEqual([
        {
          type: 'p',
          parts: [{ text: 'No pude conectarme. Revisa tu internet e intenta de nuevo.' }],
        },
      ]);
      expect(last.retry?.text).toBe('¿Me llegó el pago?');
    });

    it('un corte de red antes del primer byte tampoco la repite', () => {
      service.send('Hola');
      http.expectOne(STREAM_URL).error(new ProgressEvent('error'));
      http.expectNone(JSON_URL);
      expect(service.messages().at(-1)?.retry?.text).toBe('Hola');
    });

    it('un proxy caído (cuerpo que no es JSON) no la repite: pudo llegar al backend', () => {
      service.send('Hola');
      http.expectOne(STREAM_URL).flush('<html>504</html>', {
        status: 504,
        statusText: 'Gateway Timeout',
      });
      http.expectNone(JSON_URL);
      const last = service.messages().at(-1)!;
      expect(last.blocks).toEqual([
        {
          type: 'p',
          parts: [{ text: 'Zaira no pudo responder. Intenta de nuevo en un momento.' }],
        },
      ]);
      expect(last.retry?.text).toBe('Hola');
    });

    it('si se cierra sin respuesta final no la repite y deja reintentar', () => {
      service.send('Hola');
      http.expectOne(STREAM_URL).flush('data: {"t":"status","label":"Revisando…"}\n\n');
      http.expectNone(JSON_URL);
      expect(service.messages().at(-1)?.error).toBe(true);
      expect(service.messages().at(-1)?.retry?.text).toBe('Hola');
    });

    it('reintentar a mano tras un corte va por JSON: si el stream es el que falla, no se queda ahí', () => {
      service.send('Hola');
      http.expectOne(STREAM_URL).flush('data: {"t":"status","label":"Revisando…"}\n\n');

      service.retry(service.messages().at(-1)!.id);
      http.expectNone(STREAM_URL);
      http.expectOne(JSON_URL).flush({ conversationId: 'conv-1', reply: '¡Hola!' });
      expect(service.messages().map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(service.messages().at(-1)?.error).toBeUndefined();

      // Fue solo ese intento: la siguiente vuelve a mostrar el progreso.
      service.send('Otra');
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: 'Listo.' });
    });

    it('un rechazo claro del backend no se repite: 429 con su texto y su espera', () => {
      service.send('Hola');
      http.expectOne(STREAM_URL).flush(
        JSON.stringify({
          error: 'ASSISTANT_RATE_LIMITED',
          message: 'Vas muy rápido.',
          retryAfterSeconds: 45,
        }),
        { status: 429, statusText: 'Too Many Requests' },
      );
      http.expectNone(JSON_URL);

      const last = service.messages().at(-1)!;
      expect(last.blocks).toEqual([{ type: 'p', parts: [{ text: 'Vas muy rápido.' }] }]);
      expect(last.retryWait).toBe('Puedes intentar en 45 s.');
    });

    it('si la conversación se llenó, la siguiente pregunta empieza una nueva', () => {
      service.send('Hola');
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: '¡Hola!' });

      service.send('Otra');
      http.expectOne(STREAM_URL).flush(
        JSON.stringify({
          error: 'ASSISTANT_CONVERSATION_FULL',
          message: 'Esta conversación ya es muy larga.',
        }),
        { status: 409, statusText: 'Conflict' },
      );
      expect(service.messages().at(-1)?.restartQuestion).toBe('Otra');
      expect(service.messages().at(-1)?.retry).toBeUndefined();

      service.send('Una más');
      const req = http.expectOne(STREAM_URL);
      expect(req.request.body.conversationId).toBeUndefined();
      flushDone(req, { conversationId: 'conv-2', reply: 'Listo.' });
    });

    it('"Empezar conversación nueva" limpia todo y deja la pregunta lista en el cuadro', () => {
      service.send('Otra');
      http
        .expectOne(STREAM_URL)
        .flush(JSON.stringify({ error: 'ASSISTANT_CONVERSATION_FULL', message: 'Muy larga.' }), {
          status: 409,
          statusText: 'Conflict',
        });
      service.startOver(service.messages().at(-1)!.id);
      expect(service.messages()).toEqual([]);
      expect(service.draft()).toBe('Otra');
      expect(service.composerRequest()).toEqual({ force: true });
    });
  });

  describe('reintentar', () => {
    it('reenvía lo mismo, sin repetir la pregunta en pantalla', () => {
      routerUrl.url = '/businesses/negocio-1/dashboard';
      service.send('¿Por qué quedó por revisar?', { focus: { sourceEventId: 'evento-1' } });
      http
        .expectOne(STREAM_URL)
        .flush('{"message":"Caído"}', { status: 503, statusText: 'Unavailable' });

      const failed = service.messages().at(-1)!;
      expect(failed.error).toBe(true);

      routerUrl.url = '/home';
      service.retry(failed.id);
      const req = http.expectOne(STREAM_URL);
      expect(req.request.body).toEqual({
        message: '¿Por qué quedó por revisar?',
        page: 'dashboard',
        focus: { sourceEventId: 'evento-1' },
      });
      flushDone(req, { conversationId: 'conv-1', reply: 'Listo.' });
      expect(service.messages().map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(service.messages().at(-1)?.error).toBeUndefined();
    });

    it('no reintenta antes de la espera que pidió el backend', () => {
      vi.useFakeTimers();
      service.send('Hola');
      http.expectOne(STREAM_URL).flush('{"message":"Vas muy rápido.","retryAfterSeconds":30}', {
        status: 429,
        statusText: 'Too Many Requests',
      });

      const id = service.messages().at(-1)!.id;
      service.retry(id);
      http.expectNone(STREAM_URL);

      vi.advanceTimersByTime(30_000);
      expect(service.messages().at(-1)?.retryWait).toBeUndefined();
      service.retry(id);
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: 'Listo.' });
    });

    it('sin acceso al negocio no ofrece reintentar', () => {
      service.send('Hola');
      http.expectOne(STREAM_URL).flush('{"message":"Prohibido"}', {
        status: 403,
        statusText: 'Forbidden',
      });
      const last = service.messages().at(-1)!;
      expect(last.retry).toBeUndefined();
      expect(last.blocks).toEqual([
        {
          type: 'p',
          parts: [{ text: 'No tienes acceso a este negocio. Elige otro en "Negocio activo".' }],
        },
      ]);
    });

    it('con la base de datos caída no muestra el mensaje técnico, y deja reintentar', () => {
      service.send('Hola');
      http.expectOne(STREAM_URL).flush(
        JSON.stringify({
          statusCode: 503,
          message: 'La base de datos no está disponible o no soporta la operación solicitada.',
        }),
        { status: 503, statusText: 'Service Unavailable' },
      );
      const last = service.messages().at(-1)!;
      expect(last.blocks).toEqual([
        {
          type: 'p',
          parts: [{ text: 'Zaira no pudo responder. Intenta de nuevo en un momento.' }],
        },
      ]);
      expect(last.retry?.text).toBe('Hola');
    });

    it('lo mismo si llega dentro del stream', () => {
      service.send('Hola');
      chunk(
        http.expectOne(STREAM_URL),
        '{"t":"error","status":503,"message":"La base de datos no está disponible."}\n',
      );
      expect(service.messages().at(-1)?.blocks).toEqual([
        {
          type: 'p',
          parts: [{ text: 'Zaira no pudo responder. Intenta de nuevo en un momento.' }],
        },
      ]);
    });

    it('los avisos de Zaira con 502 y 503 sí se muestran', () => {
      const busy = 'Zaira está atendiendo muchas preguntas en este momento. Intenta en un minuto.';
      service.send('Hola');
      http
        .expectOne(STREAM_URL)
        .flush(JSON.stringify({ message: busy }), { status: 503, statusText: 'Unavailable' });
      expect(service.messages().at(-1)?.blocks).toEqual([{ type: 'p', parts: [{ text: busy }] }]);

      service.send('Otra');
      http
        .expectOne(STREAM_URL)
        .flush(JSON.stringify({ message: 'Zaira no pudo responder. Intenta de nuevo.' }), {
          status: 502,
          statusText: 'Bad Gateway',
        });
      expect(service.messages().at(-1)?.blocks).toEqual([
        { type: 'p', parts: [{ text: 'Zaira no pudo responder. Intenta de nuevo.' }] },
      ]);
    });
  });

  describe('ask (desde otras pantallas)', () => {
    function flushOpening(): void {
      http.expectOne(SUGGESTIONS_URL).flush({ suggestions: [] });
    }

    it('abre el chat y manda la pregunta con su contexto', () => {
      service.ask('¿Por qué este notificador dice "Fuera de línea"?', {
        page: 'notifiers',
        focus: { notifierId: 'n1' },
      });
      expect(service.open()).toBe(true);
      flushOpening();

      const req = http.expectOne(STREAM_URL);
      expect(req.request.body).toEqual({
        message: '¿Por qué este notificador dice "Fuera de línea"?',
        page: 'notifiers',
        focus: { notifierId: 'n1' },
      });
      flushDone(req, { conversationId: 'conv-1', reply: 'Listo.' });
    });

    it('un `focus` vacío no se manda', () => {
      service.ask('Hola', { focus: {} });
      flushOpening();
      const req = http.expectOne(STREAM_URL);
      expect(req.request.body).toEqual({ message: 'Hola' });
      flushDone(req, { conversationId: 'conv-1', reply: 'Listo.' });
    });

    it('con autoSend en false deja la pregunta en el cuadro, con el cursor donde se pidió', () => {
      service.ask('Me hicieron un pago de $  a las  y no aparece', { autoSend: false, cursor: 25 });
      flushOpening();
      http.expectNone(STREAM_URL);
      expect(service.draft()).toBe('Me hicieron un pago de $  a las  y no aparece');
      expect(service.composerRequest()).toEqual({ force: true, cursor: 25 });
    });

    it('sin pregunta solo abre', () => {
      service.ask('   ');
      flushOpening();
      http.expectNone(STREAM_URL);
      expect(service.open()).toBe(true);
    });

    it('si está respondiendo otra, la nueva espera su turno con todo su contexto', () => {
      service.send('Primera');
      const first = http.expectOne(STREAM_URL);

      service.ask('Segunda', { focus: { notifierId: 'n1' } });
      flushOpening();
      http.expectNone(JSON_URL);
      flushDone(first, { conversationId: 'conv-1', reply: 'Listo.' });

      const second = http.expectOne(STREAM_URL);
      expect(second.request.body).toEqual({
        message: 'Segunda',
        conversationId: 'conv-1',
        focus: { notifierId: 'n1' },
      });
      flushDone(second, { conversationId: 'conv-1', reply: 'Listo.' });
      expect(service.messages().map((m) => m.text ?? 'respuesta')).toEqual([
        'Primera',
        'respuesta',
        'Segunda',
        'respuesta',
      ]);
    });

    describe('doble clic', () => {
      const whyOffline = '¿Por qué este notificador dice "Fuera de línea"?';

      it('mientras responde la primera, el segundo clic no la vuelve a preguntar', () => {
        service.ask(whyOffline, { focus: { notifierId: 'n1' } });
        flushOpening();
        const req = http.expectOne(STREAM_URL);

        service.ask(whyOffline, { focus: { notifierId: 'n1' } });
        flushDone(req, { conversationId: 'conv-1', reply: 'Listo.' });

        http.expectNone(STREAM_URL);
        expect(service.messages().map((m) => m.text ?? 'respuesta')).toEqual([
          whyOffline,
          'respuesta',
        ]);
      });

      it('tampoco si la respuesta alcanzó a llegar entre los dos clics', () => {
        vi.useFakeTimers();
        service.ask('¿Cuáles son los precios?', { presetId: 'precios' });
        flushOpening();
        flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: 'Listo.' });

        vi.advanceTimersByTime(200);
        service.ask('¿Cuáles son los precios?', { presetId: 'precios' });
        http.expectNone(STREAM_URL);

        // Otra vez, un rato después, sí es una pregunta nueva.
        vi.advanceTimersByTime(2000);
        service.ask('¿Cuáles son los precios?', { presetId: 'precios' });
        flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: 'Listo.' });
      });

      it('tampoco mientras trae la conversación guardada', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 'conv-1', at: Date.now() }));
        service.ask(whyOffline);
        flushOpening();
        service.ask(whyOffline);

        http
          .expectOne(`${BASE}/conversations/conv-1`)
          .flush({ conversationId: 'conv-1', turns: [] });
        flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: 'Listo.' });
        http.expectNone(STREAM_URL);
      });

      it('la misma pregunta de otro notificador no es repetida', () => {
        service.ask(whyOffline, { focus: { notifierId: 'n1' } });
        flushOpening();
        const first = http.expectOne(STREAM_URL);
        service.ask(whyOffline, { focus: { notifierId: 'n2' } });
        flushDone(first, { conversationId: 'conv-1', reply: 'Listo.' });

        const second = http.expectOne(STREAM_URL);
        expect(second.request.body.focus).toEqual({ notifierId: 'n2' });
        flushDone(second, { conversationId: 'conv-1', reply: 'Listo.' });
      });

      it('las preguntas que esperan no se pierden: se responden en orden', () => {
        service.send('Primera');
        const first = http.expectOne(STREAM_URL);
        service.ask('Del notificador A', { focus: { notifierId: 'a' } });
        flushOpening();
        service.ask('Del notificador B', { focus: { notifierId: 'b' } });
        service.ask('Del notificador A', { focus: { notifierId: 'a' } });

        flushDone(first, { conversationId: 'conv-1', reply: 'Listo.' });
        const a = http.expectOne(STREAM_URL);
        expect(a.request.body.message).toBe('Del notificador A');
        flushDone(a, { conversationId: 'conv-1', reply: 'Listo.' });
        const b = http.expectOne(STREAM_URL);
        expect(b.request.body.message).toBe('Del notificador B');
        flushDone(b, { conversationId: 'conv-1', reply: 'Listo.' });
        http.expectNone(STREAM_URL);
      });
    });

    describe('entrada para completar ("¿Falta un pago?")', () => {
      const template = 'Me hicieron un pago de $  a las  y no aparece';

      it('no borra lo que la persona ya había escrito', () => {
        service.draft.set('Un texto largo que venía escribiendo');
        service.ask(template, { autoSend: false, cursor: 25 });
        flushOpening();

        expect(service.draft()).toBe('Un texto largo que venía escribiendo');
        expect(service.composerRequest()).toEqual({ force: true });
      });

      it('un cuadro con solo espacios cuenta como vacío', () => {
        service.draft.set('   ');
        service.ask(template, { autoSend: false, cursor: 25 });
        flushOpening();
        expect(service.draft()).toBe(template);
        expect(service.composerRequest()).toEqual({ force: true, cursor: 25 });
      });

      it('con el tope agotado no llena un cuadro apagado: lleva a las preguntas frecuentes', () => {
        service.send('Hola');
        flushDone(http.expectOne(STREAM_URL), {
          conversationId: 'conv-1',
          reply: 'Este mes tu negocio ya usó…',
          kind: 'budget_reached',
        });
        expect(service.menuRequest()).toBe(false);

        service.ask(template, { autoSend: false, cursor: 25 });
        flushOpening();

        expect(service.open()).toBe(true);
        expect(service.draft()).toBe('');
        expect(service.menuRequest()).toBe(true);
        expect(service.composerRequest()?.cursor).toBeUndefined();
      });
    });
  });

  describe('sugerencias al abrir', () => {
    it('las pide con el negocio activo, máximo 3, y no vuelve a pedir enseguida', () => {
      service.toggle();
      const req = http.expectOne(SUGGESTIONS_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('x-business-account-id')).toBe('negocio-1');
      req.flush({
        suggestions: [
          { id: 'a', title: 'A', text: 'Uno', severity: 'critical', ask: '¿Por qué?' },
          { id: 'b', title: 'B', text: 'Dos', severity: 'warn', presetId: 'precios' },
          { id: 'c', title: 'C', text: 'Tres', severity: 'info' },
          { id: 'd', title: 'D', text: 'Sobra', severity: 'info' },
        ],
      });
      expect(service.suggestions().map((s) => s.id)).toEqual(['a', 'b', 'c']);

      service.toggle();
      service.toggle();
      http.expectNone(SUGGESTIONS_URL);
    });

    it('si fallan queda el menú de siempre, sin error', () => {
      service.toggle();
      http.expectOne(SUGGESTIONS_URL).flush('nope', { status: 404, statusText: 'Not Found' });
      expect(service.suggestions()).toEqual([]);
      expect(service.messages()).toEqual([]);
    });

    it('tolera una respuesta incompleta y entiende `warning`', () => {
      service.toggle();
      http.expectOne(SUGGESTIONS_URL).flush({
        suggestions: [
          { id: 'a', text: 'Sin título', severity: 'warning' },
          { id: 'b', severity: 'info' },
          null,
        ],
      });
      expect(service.suggestions()).toEqual([
        { id: 'a', title: '', text: 'Sin título', severity: 'warn' },
      ]);
    });

    it('al cambiar de negocio se borran y se piden las del otro', () => {
      service.toggle();
      http.expectOne(SUGGESTIONS_URL).flush({
        suggestions: [{ id: 'a', title: 'A', text: 'Uno', severity: 'info' }],
      });

      activeBusinessAccountId.set('negocio-2');
      TestBed.tick();
      expect(service.suggestions()).toEqual([]);
      const req = http.expectOne(SUGGESTIONS_URL);
      expect(req.request.headers.get('x-business-account-id')).toBe('negocio-2');
      req.flush({ suggestions: [] });
    });

    it('sin negocio activo no pide nada', () => {
      activeBusinessAccountId.set(null);
      TestBed.tick();
      service.toggle();
      http.expectNone(SUGGESTIONS_URL);
    });
  });

  describe('calificación', () => {
    function answered(reply: object = { turn: 2 }): number {
      service.send('Hola');
      flushDone(http.expectOne(STREAM_URL), {
        conversationId: 'conv-1',
        reply: 'Listo.',
        ...reply,
      });
      return service.messages().at(-1)!.id;
    }

    it('guarda el pulgar y luego el motivo', () => {
      const id = answered();
      service.vote(id, 'down');
      const vote = http.expectOne(FEEDBACK_URL);
      expect(vote.request.headers.get('x-business-account-id')).toBe('negocio-1');
      expect(vote.request.body).toEqual({ conversationId: 'conv-1', turn: 2, value: 'down' });
      vote.flush({ ok: true });
      expect(service.messages().at(-1)?.vote).toBe('down');

      service.comment(id, 'Está mal');
      const comment = http.expectOne(FEEDBACK_URL);
      expect(comment.request.body).toEqual({
        conversationId: 'conv-1',
        turn: 2,
        value: 'down',
        comment: 'Está mal',
      });
      comment.flush({ ok: true });
      expect(service.messages().at(-1)?.voteComment).toBe('Está mal');
    });

    it('si no se pudo guardar, el pulgar vuelve a quedar disponible', () => {
      const id = answered();
      service.vote(id, 'up');
      expect(service.messages().at(-1)?.vote).toBe('up');
      http.expectOne(FEEDBACK_URL).flush('nope', { status: 500, statusText: 'Error' });
      expect(service.messages().at(-1)?.vote).toBeUndefined();
    });

    it('sin `turn` no hay nada que calificar (backend viejo)', () => {
      const id = answered({ turn: undefined });
      service.vote(id, 'up');
      http.expectNone(FEEDBACK_URL);
      expect(service.messages().at(-1)?.vote).toBeUndefined();
    });
  });

  describe('retomar la conversación al recargar', () => {
    function save(at = Date.now(), key = STORAGE_KEY, id = 'conv-1'): void {
      localStorage.setItem(key, JSON.stringify({ id, at }));
    }

    function flushSuggestions(): void {
      http.expectOne(SUGGESTIONS_URL).flush({ suggestions: [] });
    }

    it('recuerda la conversación por usuario y negocio', () => {
      service.send('Hola');
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: '¡Hola!' });
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.id).toBe('conv-1');
      expect(typeof saved.at).toBe('number');
    });

    it('al abrir trae lo guardado y sigue la misma conversación', () => {
      save();
      service.toggle();
      flushSuggestions();
      expect(service.restoring()).toBe(true);
      const req = http.expectOne(`${BASE}/conversations/conv-1`);
      expect(req.request.headers.get('x-business-account-id')).toBe('negocio-1');
      req.flush({
        conversationId: 'conv-1',
        turns: [
          { role: 'user', text: 'Ve a **esto**' },
          { role: 'assistant', text: 'Abre "Notificadores".' },
          { role: 'tool_call', text: 'no se muestra' },
        ],
      });

      expect(service.restoring()).toBe(false);
      const [user, assistant] = service.messages();
      expect(service.messages()).toHaveLength(2);
      // Lo del usuario se muestra tal cual; lo de Zaira, con formato y enlaces.
      expect(user.blocks).toEqual([{ type: 'p', parts: [{ text: 'Ve a **esto**' }] }]);
      expect(assistant.blocks).toEqual([
        {
          type: 'p',
          parts: [{ text: 'Abre ' }, { text: 'Notificadores', route: 'notifiers' }, { text: '.' }],
        },
      ]);

      service.send('Sigo');
      const next = http.expectOne(STREAM_URL);
      expect(next.request.body.conversationId).toBe('conv-1');
      flushDone(next, { conversationId: 'conv-1', reply: 'Listo.' });
    });

    it('una respuesta restaurada se puede calificar con su turno', () => {
      save();
      service.toggle();
      flushSuggestions();
      http.expectOne(`${BASE}/conversations/conv-1`).flush({
        conversationId: 'conv-1',
        turns: [
          { role: 'user', text: 'Primera', turn: 1 },
          { role: 'assistant', text: 'Respuesta uno', turn: 1 },
          { role: 'user', text: 'Segunda', turn: 2 },
          { role: 'assistant', text: 'Respuesta dos', turn: 2 },
        ],
      });

      const last = service.messages().at(-1)!;
      expect(last.turn).toBe(2);
      expect(last.conversationId).toBe('conv-1');
      // El turno es de las respuestas: una pregunta del usuario no se califica.
      expect(service.messages()[0].turn).toBeUndefined();

      service.vote(last.id, 'down');
      const vote = http.expectOne(FEEDBACK_URL);
      expect(vote.request.body).toEqual({ conversationId: 'conv-1', turn: 2, value: 'down' });
      vote.flush({ ok: true });
      expect(service.messages().at(-1)?.vote).toBe('down');
    });

    it('un backend que no manda el turno deja la respuesta sin calificar', () => {
      save();
      service.toggle();
      flushSuggestions();
      http.expectOne(`${BASE}/conversations/conv-1`).flush({
        conversationId: 'conv-1',
        turns: [{ role: 'assistant', text: 'Sin turno' }],
      });
      expect(service.messages()[0].turn).toBeUndefined();
      expect(service.messages()[0].conversationId).toBeUndefined();
    });

    it('solo pregunta una vez, aunque cierre y abra el panel', () => {
      save();
      service.toggle();
      flushSuggestions();
      http.expectOne(`${BASE}/conversations/conv-1`).flush({ conversationId: 'conv-1', turns: [] });
      service.toggle();
      service.toggle();
      http.expectNone(`${BASE}/conversations/conv-1`);
    });

    it('pasadas 24 horas no la trae y la olvida', () => {
      save(Date.now() - 24 * 60 * 60_000 - 1000);
      service.toggle();
      flushSuggestions();
      http.expectNone(`${BASE}/conversations/conv-1`);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(service.restoring()).toBe(false);
    });

    it('si el backend no la reconoce la olvida y empieza limpio', () => {
      save();
      service.toggle();
      flushSuggestions();
      http
        .expectOne(`${BASE}/conversations/conv-1`)
        .flush('nope', { status: 404, statusText: 'Not Found' });
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(service.messages()).toEqual([]);

      service.send('Hola');
      const req = http.expectOne(STREAM_URL);
      expect(req.request.body.conversationId).toBeUndefined();
      flushDone(req, { conversationId: 'conv-2', reply: 'Listo.' });
    });

    it('un corte de red no la olvida, y no bloquea el chat', () => {
      save();
      service.toggle();
      flushSuggestions();
      http.expectOne(`${BASE}/conversations/conv-1`).error(new ProgressEvent('error'));
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
      expect(service.restoring()).toBe(false);
    });

    it('no se queda esperando: a los 8 s sigue sin ella', () => {
      vi.useFakeTimers();
      save();
      service.toggle();
      flushSuggestions();
      const req = http.expectOne(`${BASE}/conversations/conv-1`);
      vi.advanceTimersByTime(8000);
      expect(req.cancelled).toBe(true);
      expect(service.restoring()).toBe(false);
    });

    it('la pregunta que llega mientras trae la conversación espera y la continúa', () => {
      save();
      service.ask('Nueva pregunta', { page: 'home' });
      flushSuggestions();
      http.expectNone(STREAM_URL);
      expect(service.messages()).toEqual([]);

      http.expectOne(`${BASE}/conversations/conv-1`).flush({
        conversationId: 'conv-1',
        turns: [
          { role: 'user', text: 'Vieja' },
          { role: 'assistant', text: 'Respuesta vieja' },
        ],
      });
      const req = http.expectOne(STREAM_URL);
      expect(req.request.body).toEqual({
        message: 'Nueva pregunta',
        conversationId: 'conv-1',
        page: 'home',
      });
      flushDone(req, { conversationId: 'conv-1', reply: 'Listo.' });
      expect(service.messages().map((m) => m.text ?? 'respuesta')).toEqual([
        'Vieja',
        'respuesta',
        'Nueva pregunta',
        'respuesta',
      ]);
    });

    it('cada negocio retoma la suya', () => {
      save(Date.now(), 'yep-zaira-conversation:usuario-1:negocio-2', 'conv-2');
      activeBusinessAccountId.set('negocio-2');
      TestBed.tick();
      service.toggle();
      flushSuggestions();
      http.expectOne(`${BASE}/conversations/conv-2`).flush({
        conversationId: 'conv-2',
        turns: [{ role: 'assistant', text: 'De este negocio' }],
      });
      expect(service.conversationId()).toBe('conv-2');
    });

    it('"Reiniciar chat" olvida la conversación y limpia el cuadro', () => {
      service.send('Hola');
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: '¡Hola!' });
      service.draft.set('a medio escribir');

      service.reset();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(service.draft()).toBe('');
      expect(service.conversationId()).toBeNull();
    });

    it('sin almacenamiento funciona igual', () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('bloqueado');
      });
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('bloqueado');
      });
      service.toggle();
      flushSuggestions();
      service.send('Hola');
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: '¡Hola!' });
      expect(service.messages()).toHaveLength(2);
      getItem.mockRestore();
      setItem.mockRestore();
    });

    it('un valor dañado se trata como si no hubiera nada', () => {
      localStorage.setItem(STORAGE_KEY, '{dañado');
      service.toggle();
      flushSuggestions();
      expect(service.restoring()).toBe(false);
    });
  });

  describe('cerrar sesión o cambiar de usuario', () => {
    function chatted(): void {
      service.toggle();
      http.expectOne(SUGGESTIONS_URL).flush({
        suggestions: [{ id: 'a', title: 'A', text: 'Uno', severity: 'info' }],
      });
      service.send('Dato privado de Ana');
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: '¡Hola!' });
      service.draft.set('a medio escribir');
    }

    function expectCleanChat(): void {
      expect(service.messages()).toEqual([]);
      expect(service.draft()).toBe('');
      expect(service.conversationId()).toBeNull();
      expect(service.suggestions()).toEqual([]);
      expect(service.budgetReached()).toBe(false);
      expect(service.open()).toBe(false);
    }

    it('al cerrar sesión limpia el chat, cierra el panel y borra lo guardado', () => {
      chatted();
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

      user.set(null);
      activeBusinessAccountId.set(null);
      TestBed.tick();

      expectCleanChat();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('sin negocio activo también limpia: el negocio pasa de nada a nada', () => {
      activeBusinessAccountId.set(null);
      TestBed.tick();
      service.toggle();
      service.send('Dato privado de Ana');
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: '¡Hola!' });
      service.draft.set('a medio escribir');
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 'conv-1', at: Date.now() }));

      user.set(null);
      TestBed.tick();

      expectCleanChat();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('entre dos personas sin negocio, la segunda no ve nada de la primera', () => {
      activeBusinessAccountId.set(null);
      TestBed.tick();
      service.send('Dato privado de Ana');
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'conv-1', reply: '¡Hola!' });

      user.set({ id: 'usuario-2' });
      TestBed.tick();

      expectCleanChat();
      service.send('Hola, soy Beto');
      const req = http.expectOne(STREAM_URL);
      expect(req.request.body.conversationId).toBeUndefined();
      flushDone(req, { conversationId: 'conv-2', reply: '¡Hola!' });
    });

    it('cambiar de usuario en el mismo negocio limpia y no retoma lo de la otra persona', () => {
      chatted();
      user.set({ id: 'usuario-2' });
      TestBed.tick();

      expectCleanChat();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

      service.toggle();
      http.expectOne(SUGGESTIONS_URL).flush({ suggestions: [] });
      http.expectNone(`${BASE}/conversations/conv-1`);
    });

    it('borra lo guardado de cualquier negocio, y deja lo que no es de Zaira', () => {
      localStorage.setItem('yep-zaira-conversation:usuario-1:negocio-2', '{"id":"x","at":1}');
      localStorage.setItem('yep-zaira-conversation:usuario-9:negocio-9', '{"id":"y","at":1}');
      localStorage.setItem('yep-zaira-intro-v1', 'visto');
      localStorage.setItem('otra-cosa', 'sigue');

      user.set(null);
      TestBed.tick();

      expect(localStorage.getItem('yep-zaira-conversation:usuario-1:negocio-2')).toBeNull();
      expect(localStorage.getItem('yep-zaira-conversation:usuario-9:negocio-9')).toBeNull();
      expect(localStorage.getItem('yep-zaira-intro-v1')).toBe('visto');
      expect(localStorage.getItem('otra-cosa')).toBe('sigue');
    });

    it('una respuesta que estaba en camino no aparece ni se guarda para el siguiente', () => {
      service.send('Dato privado de Ana');
      const req = http.expectOne(STREAM_URL);
      user.set({ id: 'usuario-2' });
      TestBed.tick();

      expect(req.cancelled).toBe(true);
      expect(service.sending()).toBe(false);
      expect(service.messages()).toEqual([]);
    });

    it('la cola de preguntas se descarta', () => {
      service.send('Primera');
      http.expectOne(STREAM_URL);
      service.ask('En cola');
      http.expectOne(SUGGESTIONS_URL).flush({ suggestions: [] });

      user.set(null);
      TestBed.tick();
      http.expectNone(STREAM_URL);
      expect(service.messages()).toEqual([]);
    });

    it('editar el perfil no reinicia nada: el usuario sigue siendo el mismo', () => {
      chatted();
      user.set({ id: 'usuario-1' });
      TestBed.tick();

      expect(service.messages()).toHaveLength(2);
      expect(service.draft()).toBe('a medio escribir');
      expect(service.open()).toBe(true);
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });
  });

  describe('questionBefore', () => {
    it('da la pregunta que originó una respuesta', () => {
      service.send('Primera');
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'c', reply: 'R1' });
      service.send('Segunda');
      flushDone(http.expectOne(STREAM_URL), { conversationId: 'c', reply: 'R2' });
      const [, first, , second] = service.messages();
      expect(service.questionBefore(first.id)).toBe('Primera');
      expect(service.questionBefore(second.id)).toBe('Segunda');
    });
  });
});

describe('assistantMenu', () => {
  it('al dueño le ofrece primero la pregunta más valiosa', () => {
    const menu = assistantMenu('account_owner');
    expect(menu[0]).toEqual({ question: '¿Por qué no me llegó un pago?' });
    expect(menu.some((item) => item.presetId === 'agregar-notificador')).toBe(true);
    expect(new Set(menu.map((item) => item.presetId ?? item.question)).size).toBe(menu.length);
  });

  it('a un empleado no le ofrece lo que solo configura el dueño', () => {
    const presets = assistantMenu('account_staff').map((item) => item.presetId);
    expect(presets).not.toContain('agregar-notificador');
    expect(presets).not.toContain('configurar-empleados');
    expect(presets).not.toContain('precios');
    expect(assistantMenu('account_staff')[0].question).toBe('¿Por qué no veo un pago?');
  });

  it('sin membresía (superadmin) ve el menú completo', () => {
    expect(assistantMenu(null)).toEqual(assistantMenu('account_owner'));
  });
});
