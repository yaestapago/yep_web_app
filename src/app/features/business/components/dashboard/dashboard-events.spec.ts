import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { SourceEvent } from '../../../../shared/models/source-event.models';
import { TtsPlaybackService } from '../../../source-events/services/tts-playback.service';
import { DashboardEventsPanel } from './dashboard-events';

function sourceEvent(overrides: Partial<SourceEvent> & Pick<SourceEvent, 'id'>): SourceEvent {
  return {
    accountId: 'acc-1',
    sourceType: 'NOTIFIER_APP',
    rawPayload: {},
    status: 'processed',
    normalized: { bankId: 'nequi', amount: 50000, currency: 'COP' },
    createdAt: '2026-10-06T15:00:00.000Z',
    updatedAt: '2026-10-06T15:00:00.000Z',
    ...overrides,
  };
}

describe('DashboardEventsPanel — un pago, varias fuentes', () => {
  function create(
    events: SourceEvent[],
    inputs: { corroboratedIds?: Set<string> } = {},
  ): ComponentFixture<DashboardEventsPanel> {
    TestBed.configureTestingModule({
      providers: [
        // La voz no se prueba aquí: solo el toggle de la cabecera la usa.
        { provide: TtsPlaybackService, useValue: { enabled: signal(false), setEnabled: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(DashboardEventsPanel);
    fixture.componentRef.setInput('events', events);
    if (inputs.corroboratedIds) {
      fixture.componentRef.setInput('corroboratedIds', inputs.corroboratedIds);
    }
    fixture.detectChanges();
    return fixture;
  }

  function rows(fixture: ComponentFixture<DashboardEventsPanel>): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('li.event'));
  }

  it('muestra "Confirmado por 2 fuentes" cuando dos notificadores reportan el mismo pago', () => {
    const fixture = create([
      sourceEvent({
        id: 'evt-b',
        notifierId: 'phone-2',
        linkedTransactionId: 'tx-1',
        createdAt: '2026-10-06T15:00:05.000Z',
      }),
      sourceEvent({ id: 'evt-a', notifierId: 'phone-1', linkedTransactionId: 'tx-1' }),
    ]);

    const list = rows(fixture);
    expect(list.length).toBe(1);
    expect(list[0].textContent).toContain('Confirmado por 2 fuentes');
    // El tooltip de la píldora explica de dónde salen las 2 fuentes.
    expect(list[0].querySelector('.event__type')?.getAttribute('title')).toBe(
      'App notificadora (2)',
    );
  });

  it('cuenta notificadores distintos: correo + app también son 2 fuentes', () => {
    const fixture = create([
      sourceEvent({ id: 'evt-a', notifierId: 'phone-1', linkedTransactionId: 'tx-1' }),
      sourceEvent({
        id: 'evt-mail',
        sourceType: 'EMAIL_GMAIL',
        notifierId: 'mailbox-1',
        linkedTransactionId: 'tx-1',
      }),
    ]);

    const [row] = rows(fixture);
    expect(row.textContent).toContain('Confirmado por 2 fuentes');
    expect(row.querySelector('.event__type')?.getAttribute('title')).toBe(
      'App notificadora + Correo',
    );
  });

  it('no muestra el rótulo con una sola fuente, aunque ese notificador haya enviado dos avisos', () => {
    const fixture = create([
      sourceEvent({ id: 'evt-a1', notifierId: 'phone-1', linkedTransactionId: 'tx-1' }),
      sourceEvent({ id: 'evt-a2', notifierId: 'phone-1', linkedTransactionId: 'tx-1' }),
      sourceEvent({ id: 'evt-solo', notifierId: 'phone-1' }), // otro pago, sin enlazar
    ]);

    const list = rows(fixture);
    expect(list.length).toBe(2);
    for (const row of list) {
      expect(row.textContent).not.toContain('Confirmado por');
    }
  });

  it('sin notificador, cuenta por tipo de origen', () => {
    const fixture = create([
      sourceEvent({ id: 'evt-app', linkedTransactionId: 'tx-1' }),
      sourceEvent({ id: 'evt-app-2', linkedTransactionId: 'tx-1' }),
      sourceEvent({ id: 'evt-mail', sourceType: 'EMAIL_GMAIL', linkedTransactionId: 'tx-1' }),
    ]);

    expect(rows(fixture)[0].textContent).toContain('Confirmado por 2 fuentes');
  });

  it('resalta la fila del pago mientras dura la corroboración en vivo', () => {
    const fixture = create(
      [
        sourceEvent({
          id: 'evt-b',
          notifierId: 'phone-2',
          linkedTransactionId: 'tx-1',
          createdAt: '2026-10-06T15:00:05.000Z',
        }),
        sourceEvent({ id: 'evt-a', notifierId: 'phone-1', linkedTransactionId: 'tx-1' }),
        sourceEvent({ id: 'evt-other', notifierId: 'phone-1', linkedTransactionId: 'tx-2' }),
      ],
      { corroboratedIds: new Set(['evt-b']) },
    );

    const [paymentRow, otherRow] = rows(fixture);
    expect(paymentRow.classList).toContain('event--corroborated');
    expect(otherRow.classList).not.toContain('event--corroborated');

    fixture.componentRef.setInput('corroboratedIds', new Set());
    fixture.detectChanges();
    expect(paymentRow.classList).not.toContain('event--corroborated');
  });

  it('marca "vía SMS" el pago que llegó por el respaldo SMS (aunque otra fuente lo confirme)', () => {
    const fixture = create([
      sourceEvent({
        id: 'evt-sms',
        notifierId: 'phone-1',
        linkedTransactionId: 'tx-1',
        transport: 'sms',
      }),
      sourceEvent({
        id: 'evt-mail',
        sourceType: 'EMAIL_GMAIL',
        notifierId: 'mailbox-1',
        linkedTransactionId: 'tx-1',
      }),
      sourceEvent({ id: 'evt-net', notifierId: 'phone-1', linkedTransactionId: 'tx-2' }),
    ]);

    const [smsRow, internetRow] = rows(fixture);
    expect(smsRow.querySelector('[data-testid="via-sms"]')?.textContent?.trim()).toBe('vía SMS');
    expect(internetRow.querySelector('[data-testid="via-sms"]')).toBeNull();
  });
});
