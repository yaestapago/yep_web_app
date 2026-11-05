import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { AssistantChatService } from '../../services/assistant-chat.service';
import { AssistantWidget } from './assistant-widget';

const BASE = `${environment.apiUrl}/assistant`;
const STREAM_URL = `${BASE}/messages/stream`;
const SUGGESTIONS_URL = `${BASE}/suggestions`;

function sessionMock(role: 'account_owner' | 'account_staff' = 'account_owner') {
  return {
    user: signal({ id: 'u1', firstName: 'Ana' }),
    isSupportUser: signal(false),
    isSuperUser: signal(false),
    activeBusinessAccountId: signal('n1'),
    activeMembership: signal({ role, businessAccount: { name: 'Panadería Sol' } }),
  };
}

function setup() {
  const open = signal(false);
  const chat = {
    open,
    messages: signal([]),
    sending: signal(false),
    restoring: signal(false),
    busy: signal(false),
    draft: signal(''),
    progress: signal(null),
    suggestions: signal([]),
    budgetReached: signal(false),
    conversationId: signal(null),
    composerRequest: signal(null),
    menuRequest: signal(false),
    toggle: vi.fn(() => open.update((value) => !value)),
    close: vi.fn(() => open.set(false)),
    reset: vi.fn(),
    send: vi.fn(),
    requestComposerFocus: vi.fn(),
    loadSuggestions: vi.fn(),
    questionBefore: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [AssistantWidget],
    providers: [
      provideRouter([]),
      { provide: AssistantChatService, useValue: chat },
      { provide: AuthSessionService, useValue: sessionMock() },
    ],
  });
  const fixture = TestBed.createComponent(AssistantWidget);
  fixture.detectChanges();
  // Señales protegidas del componente, para revisar el estado sin depender del DOM del modal.
  const widget = fixture.componentInstance as unknown as {
    introOpen: () => boolean;
    nudgeVisible: () => boolean;
    closeIntro: () => void;
    startFromIntro: () => void;
  };
  return { fixture, widget, chat };
}

describe('AssistantWidget · presentación de Zaira', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('la primera vez muestra la presentación y no el saludo', () => {
    const { widget } = setup();
    vi.advanceTimersByTime(5000);
    expect(widget.introOpen()).toBe(true);
    expect(widget.nudgeVisible()).toBe(false);
  });

  it('una vez cerrada no vuelve a salir', () => {
    const first = setup();
    vi.advanceTimersByTime(1500);
    first.widget.closeIntro();
    expect(localStorage.getItem('yep-zaira-intro-v1')).not.toBeNull();

    TestBed.resetTestingModule();
    const second = setup();
    vi.advanceTimersByTime(5000);
    expect(second.widget.introOpen()).toBe(false);
  });

  it('"Pregúntale a Zaira" cierra la presentación y abre el chat', () => {
    const { widget, chat } = setup();
    vi.advanceTimersByTime(1500);
    widget.startFromIntro();
    expect(widget.introOpen()).toBe(false);
    expect(chat.toggle).toHaveBeenCalled();
    expect(chat.open()).toBe(true);
  });

  it('antes del saludo diario pide los avisos, una sola vez', () => {
    localStorage.setItem('yep-zaira-intro-v1', 'visto');
    const { widget, chat } = setup();
    expect(chat.loadSuggestions).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(4000);
    expect(widget.nudgeVisible()).toBe(true);
  });
});

/** El widget con el servicio real: lo que ve la persona con cada respuesta del backend. */
describe('AssistantWidget · conversación', () => {
  let fixture: ComponentFixture<AssistantWidget>;
  let http: HttpTestingController;
  let chat: AssistantChatService;
  let element: HTMLElement;
  let session: ReturnType<typeof sessionMock>;

  function render(role: 'account_owner' | 'account_staff' = 'account_owner') {
    session = sessionMock(role);
    TestBed.configureTestingModule({
      imports: [AssistantWidget],
      providers: [
        // Comodín: seguir un enlace del chat no debe fallar por no tener las pantallas reales.
        provideRouter([{ path: '**', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthSessionService, useValue: session },
      ],
    });
    fixture = TestBed.createComponent(AssistantWidget);
    http = TestBed.inject(HttpTestingController);
    chat = TestBed.inject(AssistantChatService);
    element = fixture.nativeElement;
    // En el documento: el foco no funciona en un elemento suelto.
    document.body.appendChild(element);
    fixture.detectChanges();
  }

  async function openPanel(suggestions: unknown[] = []): Promise<void> {
    element.querySelector<HTMLButtonElement>('.assistant-fab')!.click();
    http.expectOne(SUGGESTIONS_URL).flush({ suggestions });
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function answer(reply: object): Promise<void> {
    chat.send('¿Cómo voy?');
    http
      .expectOne(STREAM_URL)
      .flush(`data: ${JSON.stringify({ t: 'done', conversationId: 'c1', ...reply })}\n\n`);
    await settle();
  }

  function buttonsText(selector = 'button'): string[] {
    return Array.from(element.querySelectorAll(selector)).map((b) => b.textContent?.trim() ?? '');
  }

  beforeEach(() => {
    localStorage.clear();
    // La presentación ya se vio y el saludo de hoy ya salió: solo el chat.
    localStorage.setItem('yep-zaira-intro-v1', 'visto');
    localStorage.setItem('yep-zaira-nudge', new Date().toISOString().slice(0, 10));
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    fixture.nativeElement.remove();
    http.verify();
  });

  it('al abrir saluda, dice que es un robot y ofrece el menú según el rol', async () => {
    render('account_staff');
    await openPanel();
    expect(element.querySelector('.assistant-bubble')?.textContent).toContain(
      'Hola, Ana. Soy Zaira, un robot que responde preguntas sobre YEP. No soy una persona.',
    );
    const human = element.querySelector<HTMLAnchorElement>('.assistant-presentation__actions a')!;
    expect(human.textContent).toContain('Hablar con una persona');
    expect(human.getAttribute('href')).toContain('https://wa.me/573108019222?text=');
    expect(human.getAttribute('target')).toBe('_blank');
    expect(buttonsText('.assistant-menu__item')).toEqual([
      '¿Por qué no veo un pago?',
      '¿Qué puedo ver en YEP?',
      '¿Cómo recibo alertas de WhatsApp?',
      '¿Ustedes acceden a mi cuenta bancaria?',
    ]);
  });

  it('el foco entra al cuadro al abrir y vuelve al botón al minimizar', async () => {
    render();
    await openPanel();
    expect(document.activeElement).toBe(element.querySelector('textarea'));
    expect(chat.composerRequest()).toBeNull();

    const panel = element.querySelector<HTMLElement>('.assistant-panel')!;
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(element.querySelector('.assistant-panel')).toBeNull();
    expect(document.activeElement).toBe(element.querySelector('.assistant-fab'));
  });

  it('una pregunta para completar queda en el cuadro, enfocada y con el cursor donde se pidió', async () => {
    render();
    chat.ask('Me hicieron un pago de $  a las  y no aparece', { autoSend: false, cursor: 25 });
    http.expectOne(SUGGESTIONS_URL).flush({ suggestions: [] });
    await settle();

    const textarea = element.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(textarea.value).toBe('Me hicieron un pago de $  a las  y no aparece');
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(25);
    expect(textarea.selectionEnd).toBe(25);
  });

  it('una respuesta larga se muestra desde su inicio; la pregunta y la espera, por el final', async () => {
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return { top: this.hasAttribute('data-message-id') ? 400 : 100 } as DOMRect;
    });
    try {
      render();
      await openPanel();
      const log = element.querySelector<HTMLElement>('.assistant-panel__log')!;
      vi.spyOn(log, 'scrollHeight', 'get').mockReturnValue(900);

      chat.send('Hola');
      await settle();
      expect(log.scrollTop).toBe(900);

      log.scrollTop = 50;
      http
        .expectOne(STREAM_URL)
        .flush('{"t":"done","conversationId":"c1","reply":"Paso 1\\nPaso 2","turn":1}\n');
      await settle();
      // 50 + (400 - 100): el inicio de la burbuja arriba del área visible.
      expect(log.scrollTop).toBe(350);

      // Calificar no mueve lo que la persona está leyendo.
      log.scrollTop = 120;
      element.querySelector<HTMLButtonElement>('button[aria-label="Me sirvió"]')!.click();
      http.expectOne(`${BASE}/feedback`).flush({ ok: true });
      await settle();
      expect(log.scrollTop).toBe(120);
    } finally {
      rect.mockRestore();
    }
  });

  it('con avisos cambia el saludo y pinta cada uno con su pregunta y su botón', async () => {
    render();
    await openPanel([
      {
        id: 'phone_offline',
        title: 'Caja no se reporta',
        text: '"Caja" no se reporta hace 3 h.',
        severity: 'critical',
        ask: '¿Por qué este notificador no se reporta?',
        focus: { notifierId: 'n7' },
        action: { type: 'open_route', label: 'Abrir Notificadores', route: 'notifiers' },
      },
    ]);
    expect(element.querySelector('.assistant-bubble')?.textContent).toContain(
      'Revisé tu negocio y hay algo para mirar',
    );
    expect(element.querySelector('yep-alert')?.textContent).toContain('no se reporta hace 3 h');
    const link = element.querySelector<HTMLAnchorElement>('yep-alert a')!;
    expect(link.textContent?.trim()).toBe('Abrir Notificadores');
    expect(link.getAttribute('href')).toBe('/businesses/n1/notifiers');

    element.querySelector<HTMLButtonElement>('yep-alert .assistant-chip')!.click();
    const req = http.expectOne(STREAM_URL);
    expect(req.request.body.message).toBe('¿Por qué este notificador no se reporta?');
    expect(req.request.body.focus).toEqual({ notifierId: 'n7' });
    req.flush('{"t":"done","conversationId":"c1","reply":"Listo."}\n');
  });

  it('la presentación de robot sigue arriba cuando ya hay mensajes', async () => {
    render();
    await openPanel();
    await answer({ reply: 'Listo.' });
    const presentation = element.querySelector('.assistant-presentation');
    expect(presentation?.textContent).toContain('No soy una persona.');
    expect(presentation?.querySelector('a')?.textContent).toContain('Hablar con una persona');
    expect(element.querySelector('.assistant-menu')).toBeNull();
  });

  it('los enlaces internos respetan los permisos: un empleado ve texto, no un enlace roto', async () => {
    render();
    await openPanel();
    await answer({ reply: 'Ve a "Notificadores".' });
    const link = element.querySelector<HTMLAnchorElement>('.assistant-bubble--assistant a')!;
    expect(link.textContent?.trim()).toBe('Notificadores');
    expect(link.getAttribute('href')).toBe('/businesses/n1/notifiers');
    expect(link.hasAttribute('target')).toBe(false);

    session.activeMembership.set({ role: 'account_staff', businessAccount: { name: 'X' } });
    await settle();
    expect(element.querySelector('.assistant-messages .assistant-bubble--assistant a')).toBeNull();
    expect(element.querySelector('.assistant-messages .assistant-bubble--assistant')?.textContent).toContain(
      'Ve a "Notificadores".',
    );
  });

  it('los enlaces externos avisan que abren otra pestaña', async () => {
    render();
    await openPanel();
    await answer({ reply: 'Escríbenos al +57 310 801 9222.' });
    const link = element.querySelector<HTMLAnchorElement>('.assistant-bubble--assistant a')!;
    expect(link.getAttribute('href')).toBe('https://wa.me/573108019222');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.textContent).toContain('se abre en otra pestaña');
  });

  it('numera las listas desde donde iban', async () => {
    render();
    await openPanel();
    await answer({ reply: '1. Uno\n   - detalle\n2. Dos' });
    const lists = element.querySelectorAll('.assistant-bubble--assistant ol');
    expect(lists[0].getAttribute('start')).toBeNull();
    expect(lists[1].getAttribute('start')).toBe('2');
    expect(element.querySelector('ul.assistant-sublist')?.textContent).toContain('detalle');
  });

  it('muestra chips y acciones solo en la última respuesta', async () => {
    render();
    await openPanel();
    await answer({
      reply: 'Primera',
      followUps: [{ label: '¿Y con el correo?', presetId: 'configurar-correos' }],
      actions: [{ type: 'open_route', label: 'Abrir Notificadores', route: 'notifiers' }],
    });
    expect(buttonsText('.assistant-chip')).toEqual(['¿Y con el correo?']);
    expect(element.querySelector('.assistant-extras a')?.textContent?.trim()).toBe(
      'Abrir Notificadores',
    );

    element.querySelector<HTMLButtonElement>('.assistant-chip')!.click();
    const req = http.expectOne(STREAM_URL);
    expect(req.request.body.message).toBe('¿Y con el correo?');
    expect(req.request.body.presetId).toBe('configurar-correos');
    await settle();
    // Mientras responde no se ofrecen más opciones.
    expect(element.querySelector('.assistant-chip')).toBeNull();
    req.flush('{"t":"done","conversationId":"c1","reply":"Segunda"}\n');
    await settle();
    expect(element.querySelector('.assistant-chip')).toBeNull();
    expect(element.querySelector('.assistant-extras a')).toBeNull();
  });

  it('una acción hacia una pantalla sin permiso no se muestra', async () => {
    render('account_staff');
    await openPanel();
    await answer({
      reply: 'Hola',
      actions: [{ type: 'open_route', label: 'Abrir Notificadores', route: 'notifiers' }],
    });
    expect(element.querySelector('.assistant-extras a')).toBeNull();
  });

  it('calificar: pulgar abajo pide el motivo y ofrece soporte con el caso escrito', async () => {
    render();
    await openPanel();
    await answer({ reply: 'Hola', turn: 2 });
    expect(element.querySelector('.assistant-extras a')).toBeNull();

    const down = element.querySelector<HTMLButtonElement>('button[aria-label="No me sirvió"]')!;
    down.click();
    const vote = http.expectOne(`${BASE}/feedback`);
    expect(vote.request.body).toEqual({ conversationId: 'c1', turn: 2, value: 'down' });
    vote.flush({ ok: true });
    await settle();

    expect(element.querySelector('.assistant-extras [role="status"]')?.textContent).toContain(
      'Gracias por contarme',
    );
    expect(buttonsText('.assistant-chip')).toEqual([
      'No resolvió mi problema',
      'Está mal',
      'No lo entendí',
    ]);
    const support = element.querySelector<HTMLAnchorElement>('.assistant-extras a')!;
    expect(support.textContent).toContain('Escribir a soporte');
    const text = decodeURIComponent(support.getAttribute('href')!.split('text=')[1]);
    expect(text).toContain('Hola, soy Ana, de Panadería Sol.');
    expect(text).toContain('«¿Cómo voy?»');
    expect(text).toContain('Referencia del caso: c1');

    element.querySelector<HTMLButtonElement>('.assistant-chip')!.click();
    http.expectOne(`${BASE}/feedback`).flush({ ok: true });
    await settle();
    expect(element.querySelector('.assistant-chip')).toBeNull();
  });

  it('sin `turn` no ofrece calificar', async () => {
    render();
    await openPanel();
    await answer({ reply: 'Hola' });
    expect(element.querySelector('button[aria-label="Me sirvió"]')).toBeNull();
  });

  it('el mensaje a soporte del backend tiene prioridad', async () => {
    render();
    await openPanel();
    await answer({ reply: 'No pude', offerSupport: true, supportText: 'Resumen del caso' });
    const href = element.querySelector('.assistant-extras a')!.getAttribute('href')!;
    expect(decodeURIComponent(href.split('text=')[1])).toBe('Resumen del caso');
  });

  it('un error lleva ícono, Reintentar y soporte', async () => {
    render();
    await openPanel();
    chat.send('Hola');
    http.expectOne(STREAM_URL).flush('{"message":"Zaira no está disponible en este momento."}', {
      status: 503,
      statusText: 'Unavailable',
    });
    await settle();

    expect(element.querySelector('.assistant-bubble--error svg')).not.toBeNull();
    expect(element.querySelector('.assistant-bubble--error')?.textContent).toContain(
      'Zaira no está disponible',
    );
    expect(buttonsText('.assistant-extras yep-button button')).toEqual(['Reintentar']);
    expect(element.querySelector('.assistant-extras a')?.textContent).toContain(
      'Escribir a soporte',
    );

    element.querySelector<HTMLButtonElement>('.assistant-extras yep-button button')!.click();
    http.expectOne(STREAM_URL).flush('{"t":"done","conversationId":"c1","reply":"Listo."}\n');
    await settle();
    expect(element.querySelector('.assistant-bubble--error')).toBeNull();
  });

  it('con el límite de ráfaga el botón espera y dice cuánto', async () => {
    render();
    await openPanel();
    chat.send('Hola');
    http.expectOne(STREAM_URL).flush('{"message":"Vas muy rápido.","retryAfterSeconds":120}', {
      status: 429,
      statusText: 'Too Many Requests',
    });
    await settle();
    expect(
      element.querySelector<HTMLButtonElement>('.assistant-extras yep-button button')!.disabled,
    ).toBe(true);
    expect(element.querySelector('.assistant-extras__hint')?.textContent).toContain('en 2 min');
  });

  it('conversación llena: ofrece empezar una nueva con la pregunta lista', async () => {
    render();
    await openPanel();
    chat.send('Mi pregunta');
    http
      .expectOne(STREAM_URL)
      .flush('{"error":"ASSISTANT_CONVERSATION_FULL","message":"Muy larga."}', {
        status: 409,
        statusText: 'Conflict',
      });
    await settle();
    const restart = element.querySelector<HTMLButtonElement>(
      '.assistant-extras yep-button button',
    )!;
    expect(restart.textContent?.trim()).toBe('Empezar conversación nueva');
    restart.click();
    await settle();
    expect(chat.messages()).toEqual([]);
    expect(element.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Mi pregunta');
  });

  it('el tope agotado se nota: el cuadro se apaga y quedan las preguntas frecuentes', async () => {
    render();
    await openPanel();
    await answer({ reply: 'Ya usó todo', kind: 'budget_reached', offerSupport: true });
    expect(element.querySelector('.assistant-budget')?.textContent).toContain(
      'preguntas frecuentes siguen disponibles',
    );
    expect(element.querySelector<HTMLTextAreaElement>('textarea')!.disabled).toBe(true);
    expect(element.querySelector('.assistant-extras a')?.textContent).toContain(
      'Escribir a soporte',
    );
  });

  it('con el tope agotado, "¿Falta un pago?" abre las preguntas frecuentes, no un cuadro apagado', async () => {
    render();
    await openPanel();
    await answer({ reply: 'Ya usó todo', kind: 'budget_reached', offerSupport: true });
    expect(element.querySelector('.assistant-menu')).toBeNull();

    chat.ask('Me hicieron un pago de $  a las  y no aparece', { autoSend: false, cursor: 25 });
    await settle();

    expect(element.querySelector('.assistant-menu')).not.toBeNull();
    expect(element.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    expect(element.querySelector('.assistant-budget')).not.toBeNull();
    // El pedido se atiende una vez: la persona puede volver a ocultar el menú.
    expect(chat.menuRequest()).toBe(false);
  });

  it('un emoji partido en el mensaje a soporte no tumba la pantalla', async () => {
    render();
    await openPanel();
    await answer({
      reply: 'No pude',
      offerSupport: true,
      supportText: `Resolver esto: «pago ${'😀'.slice(0, 1)}…».`,
    });

    const href = element.querySelector('.assistant-extras a')!.getAttribute('href')!;
    expect(decodeURIComponent(href.split('text=')[1])).toBe('Resolver esto: «pago …».');
  });

  it('una respuesta restaurada ofrece los pulgares y el soporte tras un pulgar abajo', async () => {
    localStorage.setItem(
      'yep-zaira-conversation:u1:n1',
      JSON.stringify({ id: 'c1', at: Date.now() }),
    );
    render();
    await openPanel();
    http.expectOne(`${BASE}/conversations/c1`).flush({
      conversationId: 'c1',
      turns: [
        { role: 'user', text: 'Hola', turn: 1 },
        { role: 'assistant', text: 'Respuesta equivocada', turn: 1 },
      ],
    });
    await settle();

    const down = element.querySelector<HTMLButtonElement>('[aria-label="No me sirvió"]')!;
    expect(down).not.toBeNull();
    down.click();
    http.expectOne(`${BASE}/feedback`).flush({ ok: true });
    await settle();
    expect(element.querySelector('.assistant-extras a')?.textContent).toContain(
      'Escribir a soporte',
    );
  });

  it('el borrador sobrevive a minimizar: lo que se ve es lo que se envía', async () => {
    render();
    await openPanel();
    const textarea = () => element.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea().value = 'Una pregunta';
    textarea().dispatchEvent(new Event('input'));
    await settle();

    chat.close();
    await settle();
    chat.toggle();
    await settle();
    expect(textarea().value).toBe('Una pregunta');

    element.querySelector<HTMLButtonElement>('.assistant-composer__send')!.click();
    const req = http.expectOne(STREAM_URL);
    expect(req.request.body.message).toBe('Una pregunta');
    await settle();
    expect(textarea().value).toBe('');
    req.flush('{"t":"done","conversationId":"c1","reply":"Listo."}\n');
  });

  it('"Reiniciar chat" limpia también el cuadro', async () => {
    render();
    await openPanel();
    await answer({ reply: 'Hola' });
    chat.draft.set('algo');
    await settle();
    element.querySelector<HTMLButtonElement>('button[aria-label="Reiniciar chat"]')!.click();
    await settle();
    expect(element.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    expect(element.querySelector('.assistant-menu')).not.toBeNull();
  });

  it('avisa al acercarse al máximo de caracteres', async () => {
    render();
    await openPanel();
    expect(element.querySelector('.assistant-counter')).toBeNull();
    chat.draft.set('x'.repeat(950));
    await settle();
    expect(element.querySelector('.assistant-counter')?.textContent).toContain('950 de 1000');
    chat.draft.set('x'.repeat(1000));
    await settle();
    expect(element.querySelector('.assistant-counter')?.getAttribute('role')).toBe('status');
    expect(element.querySelector('.assistant-counter')?.textContent).toContain('máximo');
  });

  it('solo los mensajes son la región anunciada, no el menú', async () => {
    render();
    await openPanel();
    const log = element.querySelector('[role="log"]')!;
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(log.querySelector('.assistant-menu')).toBeNull();
    expect(element.querySelector('.assistant-panel__log')?.hasAttribute('aria-live')).toBe(false);
  });

  it('el progreso se lee como texto, no como un aria-label sobre puntos', async () => {
    render();
    await openPanel();
    chat.send('Hola');
    await settle();
    const status = () => element.querySelector('.assistant-panel__log > [role="status"]')!;
    expect(status().textContent).toContain('Zaira está escribiendo');

    const req = http.expectOne(STREAM_URL);
    const partialText = '{"t":"status","label":"Revisando tus notificadores…"}\n';
    req.event({ type: HttpEventType.DownloadProgress, loaded: 1, partialText });
    await settle();
    expect(status().textContent).toContain('Revisando tus notificadores…');
    req.flush(`${partialText}{"t":"done","conversationId":"c1","reply":"Listo."}\n`);
  });

  it('mientras recupera la conversación lo dice y no deja preguntar', async () => {
    localStorage.setItem(
      'yep-zaira-conversation:u1:n1',
      JSON.stringify({ id: 'c9', at: Date.now() }),
    );
    render();
    element.querySelector<HTMLButtonElement>('.assistant-fab')!.click();
    http.expectOne(SUGGESTIONS_URL).flush({ suggestions: [] });
    await settle();
    expect(element.querySelector('.assistant-panel__note')?.textContent).toContain(
      'Recuperando tu conversación',
    );
    expect(element.querySelector('.assistant-menu')).toBeNull();

    http.expectOne(`${BASE}/conversations/c9`).flush({
      conversationId: 'c9',
      turns: [
        { role: 'user', text: 'Hola' },
        { role: 'assistant', text: 'Sigo aquí.' },
      ],
    });
    await settle();
    expect(element.querySelector('.assistant-panel__note')).toBeNull();
    expect(element.querySelector('.assistant-messages .assistant-bubble--assistant')?.textContent).toContain(
      'Sigo aquí.',
    );
  });

  it('la dirección se copia con un toque y confirma', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render();
    await openPanel();
    await answer({ reply: 'Reenvía a yep.reenvio+abc@gmail.com' });

    const copy = element.querySelector<HTMLButtonElement>('.assistant-copy__button')!;
    expect(copy.getAttribute('aria-label')).toBe('Copiar yep.reenvio+abc@gmail.com');
    copy.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith('yep.reenvio+abc@gmail.com');
    expect(element.querySelector('.assistant-copy__button')?.textContent).toContain('Copiado');
  });

  it('el saludo diario usa el aviso urgente, solo para el dueño', async () => {
    vi.useFakeTimers();
    localStorage.removeItem('yep-zaira-nudge');
    render();
    http.expectOne(SUGGESTIONS_URL).flush({
      suggestions: [
        { id: 'a', title: 'Revisa tus correos', text: 'No llega nada', severity: 'critical' },
      ],
    });
    vi.advanceTimersByTime(4000);
    fixture.detectChanges();
    expect(element.querySelector('.assistant-nudge')?.textContent).toContain('No llega nada');

    session.activeMembership.set({ role: 'account_staff', businessAccount: { name: 'X' } });
    fixture.detectChanges();
    expect(element.querySelector('.assistant-nudge')?.textContent).toContain('¡Hola! Soy Zaira, el robot de ayuda de YEP.');
    vi.useRealTimers();
  });

  it('en celular, seguir un enlace interno minimiza el panel', async () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query.includes('max-width') }));
    vi.stubGlobal('matchMedia', matchMedia);
    try {
      render();
      await openPanel();
      await answer({ reply: 'Ve a "Empleados".' });
      element.querySelector<HTMLAnchorElement>('.assistant-bubble--assistant a')!.click();
      expect(chat.open()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
