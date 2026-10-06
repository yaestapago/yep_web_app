import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { Notifier, NotifierRecentDiscard } from '../../../../shared/models/notifier.models';
import { formatDateTime } from '../../../../shared/utils/billing-format';
import {
  DISCARD_REASON_COPY,
  NotifierDeviceDiagnostics,
  discardCountLabel,
  knownAppLabel,
} from './notifier-device-diagnostics';

function notifier(overrides: Partial<Notifier> = {}): Notifier {
  return {
    id: 'n1',
    accountId: 'a1',
    type: 'phone_app',
    displayName: 'Caja',
    bankIds: ['bancolombia'],
    bankAccountIds: [],
    allowedBreBKeys: [],
    bankAccounts: [],
    watchedPackages: [],
    active: true,
    pairingVersion: 1,
    pairedDevice: {
      deviceId: 'd1',
      model: 'Infinix X6870',
      defaultSmsPackage: 'com.transsion.messaging',
      pairedAt: '2026-10-01T12:00:00.000Z',
    },
    deviceHistory: [],
    recentDiscards: [],
    isOnline: true,
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

const discard = (overrides: Partial<NotifierRecentDiscard> = {}): NotifierRecentDiscard => ({
  packageName: 'com.transsion.messaging',
  reason: 'sender_not_matched',
  count: 4,
  firstAt: '2026-10-02T14:10:00.000Z',
  lastAt: '2026-10-06T09:31:00.000Z',
  ...overrides,
});

describe('NotifierDeviceDiagnostics — app de SMS y avisos descartados', () => {
  function render(value: Notifier): ComponentFixture<NotifierDeviceDiagnostics> {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(NotifierDeviceDiagnostics);
    fixture.componentRef.setInput('notifier', value);
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: ComponentFixture<NotifierDeviceDiagnostics>) =>
    fixture.nativeElement as HTMLElement;
  const text = (fixture: ComponentFixture<NotifierDeviceDiagnostics>) =>
    (el(fixture).textContent ?? '').replace(/\s+/g, ' ');

  it('muestra la app de SMS reportada por el teléfono, con nombre legible si se conoce', () => {
    const fixture = render(notifier());
    const sms = el(fixture).querySelector('[data-testid="sms-app"]');
    expect(sms?.textContent).toContain('App de SMS:');
    expect(sms?.textContent).toContain('Mensajes (Infinix/Tecno)');
    expect(sms?.querySelector('code')?.textContent).toBe('com.transsion.messaging');
  });

  it('sin app de SMS reportada pide abrir la app en el celular', () => {
    const fixture = render(
      notifier({
        pairedDevice: {
          deviceId: 'd1',
          defaultSmsPackage: null,
          pairedAt: '2026-10-01T12:00:00.000Z',
        },
      }),
    );
    const sms = el(fixture).querySelector('[data-testid="sms-app"]');
    expect(sms?.textContent).toContain('App de SMS:');
    expect(sms?.textContent).toContain('No detectada aún — abre la app en el celular');
    expect(sms?.querySelector('code')).toBeNull();
  });

  it('un backend anterior (sin el campo) también se muestra como no detectada', () => {
    const fixture = render(
      notifier({ pairedDevice: { deviceId: 'd1', pairedAt: '2026-10-01T12:00:00.000Z' } }),
    );
    expect(text(fixture)).toContain('No detectada aún');
    expect(el(fixture).querySelector('[data-testid="discards"]')).toBeNull();
  });

  it('no muestra nada sin teléfono emparejado ni para correo/escritorio', () => {
    expect(text(render(notifier({ pairedDevice: null }))).trim()).toBe('');
    expect(text(render(notifier({ type: 'email_gmail' }))).trim()).toBe('');
    expect(text(render(notifier({ type: 'desktop_app' }))).trim()).toBe('');
  });

  it('sin descartes recientes no muestra el bloque', () => {
    const fixture = render(notifier({ recentDiscards: [] }));
    expect(el(fixture).querySelector('[data-testid="discards"]')).toBeNull();
    expect(text(fixture)).not.toContain('Avisos descartados');
  });

  it('agrupa los descartes por motivo, en español, con la pista de qué hacer', () => {
    const fixture = render(
      notifier({
        recentDiscards: [
          discard({ packageName: 'com.nequi.mobileapp', reason: 'content_not_matched', count: 1 }),
          discard({ reason: 'sender_not_matched', count: 4 }),
          discard({ packageName: 'com.whatsapp', reason: 'package_not_watched', count: 2 }),
          discard({ packageName: 'com.android.mms', reason: 'sender_not_matched', count: 7 }),
        ],
      }),
    );
    const block = el(fixture).querySelector('[data-testid="discards"]')!;
    expect(block).not.toBeNull();
    expect(block.querySelector('summary')?.textContent?.replace(/\s+/g, ' ')).toContain(
      'Avisos descartados · 14 en los últimos 30 días',
    );

    const groups = Array.from(block.querySelectorAll('section'));
    // Orden fijo: remitente, texto, app.
    expect(groups.map((g) => g.getAttribute('data-reason'))).toEqual([
      'sender_not_matched',
      'content_not_matched',
      'package_not_watched',
    ]);
    expect(groups[0].textContent).toContain('Remitente no reconocido');
    expect(groups[0].textContent).toContain(DISCARD_REASON_COPY.sender_not_matched.hint);
    expect(groups[0].querySelectorAll('li')).toHaveLength(2);
    expect(groups[1].textContent).toContain('Texto no reconocido');
    expect(groups[1].textContent).toContain('Escríbenos para revisarlo.');
    expect(groups[2].textContent).toContain('App no escuchada');
    expect(groups[2].textContent).toContain('Llegó por una app que no estamos escuchando.');
  });

  it('cada fila muestra la app, cuántos avisos y la fecha del último', () => {
    const fixture = render(
      notifier({
        recentDiscards: [
          discard({ count: 1 }),
          discard({ packageName: 'com.android.mms', count: 7 }),
        ],
      }),
    );
    const rows = Array.from(el(fixture).querySelectorAll('li')).map((li) =>
      (li.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    const last = formatDateTime('2026-10-06T09:31:00.000Z');
    expect(rows[0]).toBe(
      `Mensajes (Infinix/Tecno) com.transsion.messaging 1 aviso · último ${last}`,
    );
    expect(rows[1]).toBe(`Mensajes com.android.mms 7 avisos · último ${last}`);
  });

  it('ignora motivos desconocidos de una versión futura de la app', () => {
    const fixture = render(
      notifier({
        recentDiscards: [discard({ reason: 'otro_motivo' as never }), discard()],
      }),
    );
    expect(el(fixture).querySelectorAll('section')).toHaveLength(1);
  });

  it('helpers: nombre conocido de apps y conteo en singular/plural', () => {
    expect(knownAppLabel('com.google.android.apps.messaging')).toBe('Mensajes de Google');
    expect(knownAppLabel('com.nequi.MobileApp')).toBe('Nequi');
    expect(knownAppLabel('com.desconocida.sms')).toBeNull();
    expect(discardCountLabel(1)).toBe('1 aviso');
    expect(discardCountLabel(1200)).toBe('1.200 avisos');
  });
});
