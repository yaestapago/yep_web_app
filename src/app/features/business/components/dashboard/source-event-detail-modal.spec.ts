import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { SourceEvent } from '../../../../shared/models/source-event.models';
import { AssistantChatService } from '../../../assistant/services/assistant-chat.service';
import { SourceEventsApiService } from '../../../source-events/services/source-events-api.service';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';
import { SourceEventDetailModal } from './source-event-detail-modal';

function sourceEvent(overrides: Partial<SourceEvent> = {}): SourceEvent {
  return {
    id: 'evento-1',
    accountId: 'acc-1',
    sourceType: 'NOTIFIER_APP',
    rawPayload: {},
    status: 'processed',
    normalized: { bankId: 'nequi', amount: 48000, currency: 'COP' },
    createdAt: '2026-10-06T15:00:00.000Z',
    updatedAt: '2026-10-06T15:00:00.000Z',
    ...overrides,
  };
}

function setup(event: SourceEvent, isSupportUser = false) {
  const chat = { ask: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: AssistantChatService, useValue: chat },
      { provide: AuthSessionService, useValue: { isSupportUser: signal(isSupportUser) } },
      {
        provide: SourceEventsApiService,
        useValue: {
          get: vi.fn(() => of({ sourceEvent: event })),
          list: vi.fn(() => of({ sourceEvents: [] })),
        },
      },
      { provide: TransactionsApiService, useValue: { get: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(SourceEventDetailModal);
  fixture.componentRef.setInput('event', event);
  fixture.detectChanges();
  const closed = vi.fn();
  fixture.componentInstance.close.subscribe(closed);
  const button = () => document.querySelector<HTMLButtonElement>('app-ask-zaira button');
  return { chat, closed, button, fixture };
}

describe('SourceEventDetailModal — preguntarle a Zaira', () => {
  it('un pago por revisar pregunta por qué quedó así, con el pago en foco', () => {
    const { chat, closed, button } = setup(sourceEvent({ status: 'needs_review' }));

    expect(button()?.textContent?.trim()).toBe('¿Por qué quedó por revisar?');
    button()?.click();

    expect(chat.ask).toHaveBeenCalledWith('¿Por qué quedó por revisar este pago de $ 48.000?', {
      presetId: undefined,
      page: undefined,
      focus: { sourceEventId: 'evento-1' },
      autoSend: true,
      cursor: undefined,
    });
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('un pago normal pregunta por el WhatsApp', () => {
    const { chat, button } = setup(sourceEvent());

    expect(button()?.textContent?.trim()).toBe('¿Por qué no me llegó el WhatsApp?');
    button()?.click();

    expect(chat.ask.mock.calls[0][0]).toBe(
      '¿Por qué no me llegó el WhatsApp de este pago de $ 48.000?',
    );
  });

  it('el modal se cierra antes de abrir el chat, que queda por debajo', () => {
    const { chat, closed, button } = setup(sourceEvent());
    const order: string[] = [];
    closed.mockImplementation(() => order.push('cerrar'));
    chat.ask.mockImplementation(() => order.push('abrir chat'));

    button()?.click();

    expect(order).toEqual(['cerrar', 'abrir chat']);
  });

  it('el rol support no lo ve', () => {
    const { button } = setup(sourceEvent(), true);
    expect(button()).toBeNull();
  });
});
