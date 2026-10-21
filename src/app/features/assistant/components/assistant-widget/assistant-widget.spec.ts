import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { AssistantChatService } from '../../services/assistant-chat.service';
import { AssistantWidget } from './assistant-widget';

function setup() {
  const open = signal(false);
  const chat = {
    open,
    messages: signal([]),
    sending: signal(false),
    toggle: vi.fn(() => open.update((value) => !value)),
    close: vi.fn(() => open.set(false)),
    reset: vi.fn(),
    send: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [AssistantWidget],
    providers: [
      { provide: AssistantChatService, useValue: chat },
      {
        provide: AuthSessionService,
        useValue: { user: signal({ firstName: 'Ana' }), isSupportUser: signal(false) },
      },
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
});
