import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { AssistantChatService } from '../../services/assistant-chat.service';
import { AskZaira } from './ask-zaira';

function setup(isSupportUser = false) {
  const chat = { ask: vi.fn() };
  TestBed.configureTestingModule({
    imports: [AskZaira],
    providers: [
      { provide: AssistantChatService, useValue: chat },
      { provide: AuthSessionService, useValue: { isSupportUser: signal(isSupportUser) } },
    ],
  });
  const fixture = TestBed.createComponent(AskZaira);
  fixture.componentRef.setInput('question', '¿Por qué quedó por revisar?');
  fixture.detectChanges();
  return { fixture, chat, element: fixture.nativeElement as HTMLElement };
}

describe('AskZaira (botón para otras pantallas)', () => {
  it('abre el chat con la pregunta y su contexto, y avisa antes para cerrar el modal', () => {
    const { fixture, chat, element } = setup();
    fixture.componentRef.setInput('label', '¿Por qué?');
    fixture.componentRef.setInput('focus', { sourceEventId: 'evento-1' });
    fixture.componentRef.setInput('page', 'dashboard');
    fixture.detectChanges();

    const order: string[] = [];
    fixture.componentInstance.asked.subscribe(() => order.push('asked'));
    chat.ask.mockImplementation(() => order.push('ask'));

    const button = element.querySelector('button')!;
    expect(button.textContent?.trim()).toBe('¿Por qué?');
    button.click();

    expect(order).toEqual(['asked', 'ask']);
    expect(chat.ask).toHaveBeenCalledWith('¿Por qué quedó por revisar?', {
      presetId: undefined,
      page: 'dashboard',
      focus: { sourceEventId: 'evento-1' },
      autoSend: true,
      cursor: undefined,
    });
  });

  it('el rol support no lo ve', () => {
    const { element } = setup(true);
    expect(element.querySelector('button')).toBeNull();
  });
});
