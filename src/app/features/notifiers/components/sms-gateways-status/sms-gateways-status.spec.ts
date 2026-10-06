import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import type {
  SmsGatewayStatus,
  SmsGatewaysResponse,
} from '../../../../shared/models/sms-gateway.models';
import { formatDateTime } from '../../../../shared/utils/billing-format';
import { SmsGatewaysAdminApiService } from '../../services/sms-gateways-admin-api.service';
import { SmsGatewaysStatus, gatewayRow } from './sms-gateways-status';

function gateway(overrides: Partial<SmsGatewayStatus> = {}): SmsGatewayStatus {
  return {
    id: 'g1',
    deviceId: 'ffffffffceb0b1db0000018e937c815b',
    phoneNumber: '+573001112233',
    lastPingAt: '2026-10-06T14:55:00.000Z',
    lastSmsAt: '2026-10-06T14:50:00.000Z',
    lastEventAt: '2026-10-06T14:55:00.000Z',
    lastEvent: 'system:ping',
    lastResult: 'accepted',
    smsCount: 12,
    acceptedCount: 10,
    lastError: null,
    lastErrorAt: null,
    stale: false,
    ...overrides,
  };
}

const response = (overrides: Partial<SmsGatewaysResponse> = {}): SmsGatewaysResponse => ({
  gateways: [gateway()],
  relay: {
    switchedOn: true,
    globallyAvailable: true,
    masterKeyConfigured: true,
    gatewayNumbers: ['+573001112233', '+573104445566'],
    webhookTokenConfigured: true,
    signingKeysConfigured: 2,
    staleAfterMinutes: 15,
  },
  ...overrides,
});

describe('SmsGatewaysStatus — receptores SMS (superadmin)', () => {
  function render(data: SmsGatewaysResponse): ComponentFixture<SmsGatewaysStatus> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SmsGatewaysAdminApiService, useValue: { list: vi.fn(() => of(data)) } },
      ],
    });
    const fixture = TestBed.createComponent(SmsGatewaysStatus);
    fixture.detectChanges();
    return fixture;
  }

  const text = (fixture: ComponentFixture<SmsGatewaysStatus>) =>
    ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

  it('muestra cada receptor con su último ping y su último SMS', () => {
    const fixture = render(response());
    const content = text(fixture);
    expect(content).toContain('Receptores SMS');
    expect(content).toContain('Respaldo: Encendido · +573001112233, +573104445566');
    expect(content).toContain('Webhook: token · 2 llave(s) de firma');
    expect(content).toContain('+573001112233');
    expect(content).toContain(`Último ping ${formatDateTime('2026-10-06T14:55:00.000Z')}`);
    expect(content).toContain(`último SMS ${formatDateTime('2026-10-06T14:50:00.000Z')}`);
    expect(content).toContain('(aceptado)');
    expect(content).toContain('10 aceptados de 12 SMS');
  });

  it('dice qué falta cuando el respaldo está apagado', () => {
    const fixture = render(
      response({
        gateways: [],
        relay: {
          ...response().relay,
          switchedOn: false,
          globallyAvailable: false,
          gatewayNumbers: [],
        },
      }),
    );
    expect(text(fixture)).toContain('Apagado (falta: SMS_RELAY_ENABLED, números receptores)');
    expect(text(fixture)).toContain('Aún no hay receptores reportando.');
  });

  it('gatewayRow: sin ping reciente → offline; nunca → unknown; error visible', () => {
    expect(gatewayRow(gateway({ stale: true })).level).toBe('offline');
    expect(gatewayRow(gateway({ lastPingAt: null, stale: true })).level).toBe('unknown');
    const row = gatewayRow(
      gateway({
        phoneNumber: null,
        lastError: 'Mongo caído',
        lastErrorAt: '2026-10-06T14:00:00.000Z',
        lastResult: 'bad_mac',
      }),
    );
    expect(row.title).toBe('…937c815b');
    expect(row.lastResult).toBe('firma inválida');
    expect(row.lastError).toContain('Mongo caído');
  });
});
