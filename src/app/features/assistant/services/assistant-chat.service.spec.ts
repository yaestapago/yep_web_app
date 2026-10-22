import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { AssistantChatService } from './assistant-chat.service';

const URL = `${environment.apiUrl}/assistant/messages`;

describe('AssistantChatService (chat con Zaira)', () => {
  let service: AssistantChatService;
  let http: HttpTestingController;
  const activeBusinessAccountId = signal<string | null>('negocio-1');

  beforeEach(() => {
    activeBusinessAccountId.set('negocio-1');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthSessionService, useValue: { activeBusinessAccountId } },
      ],
    });
    service = TestBed.inject(AssistantChatService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });

  afterEach(() => http.verify());

  it('manda la pregunta con el negocio activo y continúa la misma conversación', () => {
    service.send('  ¿Cuáles son los precios?  ');
    const first = http.expectOne(URL);
    expect(first.request.method).toBe('POST');
    expect(first.request.headers.get('x-business-account-id')).toBe('negocio-1');
    expect(first.request.body).toEqual({ message: '¿Cuáles son los precios?' });
    expect(service.sending()).toBe(true);
    first.flush({ conversationId: 'conv-1', reply: 'El plan **Basic** vale $ 30.000 al mes.' });

    expect(service.sending()).toBe(false);
    expect(service.messages().map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(service.messages()[1].blocks[0]).toEqual({
      type: 'p',
      parts: [
        { text: 'El plan ' },
        { text: 'Basic', bold: true },
        { text: ' vale $ 30.000 al mes.' },
      ],
    });

    service.send('¿Y el anual?');
    const second = http.expectOne(URL);
    expect(second.request.body).toEqual({ message: '¿Y el anual?', conversationId: 'conv-1' });
    second.flush({ conversationId: 'conv-1', reply: 'Pagas 10 meses y recibes 12.' });
  });

  it('las preguntas del menú viajan con su presetId', () => {
    service.send('¿Cuáles son los precios?', 'precios');
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ message: '¿Cuáles son los precios?', presetId: 'precios' });
    req.flush({ conversationId: 'conv-1', reply: 'Estos son los planes de YEP…' });
  });

  it('no manda preguntas vacías ni dos a la vez', () => {
    service.send('   ');
    http.expectNone(URL);

    service.send('Hola');
    service.send('Otra');
    const requests = http.match(URL);
    expect(requests).toHaveLength(1);
    requests[0].flush({ conversationId: 'conv-1', reply: '¡Hola!' });
  });

  it('al cambiar de negocio vuelve al menú y empieza otra conversación', () => {
    service.send('Hola');
    http.expectOne(URL).flush({ conversationId: 'conv-1', reply: '¡Hola!' });

    activeBusinessAccountId.set('negocio-2');
    TestBed.tick();
    expect(service.messages()).toEqual([]);

    service.send('Hola de nuevo');
    const req = http.expectOne(URL);
    expect(req.request.headers.get('x-business-account-id')).toBe('negocio-2');
    expect(req.request.body.conversationId).toBeUndefined();
    req.flush({ conversationId: 'conv-2', reply: '¡Hola!' });
  });

  it('muestra un aviso legible si Zaira no responde', () => {
    service.send('Hola');
    http
      .expectOne(URL)
      .flush(
        { error: 'ASSISTANT_RATE_LIMITED', message: 'Vas muy rápido.' },
        { status: 429, statusText: 'Too Many Requests' },
      );

    const last = service.messages().at(-1)!;
    expect(last.error).toBe(true);
    expect(last.blocks).toEqual([{ type: 'p', parts: [{ text: 'Vas muy rápido.' }] }]);
  });

  it('si la conversación se llenó, la siguiente pregunta empieza una nueva', () => {
    service.send('Hola');
    http.expectOne(URL).flush({ conversationId: 'conv-1', reply: '¡Hola!' });

    service.send('Otra');
    http
      .expectOne(URL)
      .flush(
        { error: 'ASSISTANT_CONVERSATION_FULL', message: 'Esta conversación ya es muy larga.' },
        { status: 409, statusText: 'Conflict' },
      );

    service.send('Una más');
    const req = http.expectOne(URL);
    expect(req.request.body.conversationId).toBeUndefined();
    req.flush({ conversationId: 'conv-2', reply: 'Listo.' });
  });
});
