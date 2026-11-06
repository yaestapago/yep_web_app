import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { AssistantChatService } from '../../../assistant/services/assistant-chat.service';
import { DashboardStatusPanel } from './dashboard-status';

function setup(level: 'green' | 'yellow' | 'red', notifiersLink: string[] | null) {
  const chat = { ask: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AssistantChatService, useValue: chat },
      { provide: AuthSessionService, useValue: { isSupportUser: signal(false) } },
    ],
  });
  const fixture = TestBed.createComponent(DashboardStatusPanel);
  fixture.componentRef.setInput('semaphore', { level, label: 'Estado', detail: 'Detalle' });
  fixture.componentRef.setInput('rows', []);
  fixture.componentRef.setInput('notifiersLink', notifiersLink);
  fixture.detectChanges();
  const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    'app-ask-zaira button',
  );
  return { chat, button };
}

describe('DashboardStatusPanel — "¿Qué hago?"', () => {
  it('con el estado en amarillo o rojo, el dueño le puede preguntar a Zaira', () => {
    const { chat, button } = setup('red', ['/businesses', 'b1', 'notifiers']);

    expect(button?.textContent?.trim()).toBe('¿Qué hago?');
    button?.click();

    expect(chat.ask.mock.calls[0][0]).toBe(
      '¿Qué significa el estado del sistema y cómo lo arreglo?',
    );
  });

  it('con el estado en verde no aparece', () => {
    const { button } = setup('green', ['/businesses', 'b1', 'notifiers']);
    expect(button).toBeNull();
  });

  it('quien no puede entrar a Notificadores no lo ve', () => {
    const { button } = setup('red', null);
    expect(button).toBeNull();
  });
});
