import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import {
  SMS_RELAY_CONSENT_VERSION,
  type Notifier,
  type NotifierSmsRelayStatus,
} from '../../../../shared/models/notifier.models';
import { NotifiersApiService } from '../../services/notifiers-api.service';
import {
  NotifierSmsRelay,
  SMS_RELAY_CONSENT_CHECKBOX,
  SMS_RELAY_CONSENT_TEXT,
  smsRelayCopy,
} from './notifier-sms-relay';

function relay(overrides: Partial<NotifierSmsRelayStatus> = {}): NotifierSmsRelayStatus {
  return {
    optedIn: false,
    globallyAvailable: true,
    enabled: false,
    status: 'disabled',
    consentAt: null,
    consentVersion: null,
    ...overrides,
  };
}

const ACTIVE = relay({
  optedIn: true,
  enabled: true,
  status: 'active',
  consentAt: '2026-10-06T15:00:00.000Z',
  consentVersion: SMS_RELAY_CONSENT_VERSION,
});

function notifier(overrides: Partial<Notifier> = {}): Notifier {
  return {
    id: 'n1',
    accountId: 'a1',
    type: 'phone_app',
    displayName: 'Caja',
    bankIds: [],
    bankAccountIds: [],
    allowedBreBKeys: [],
    bankAccounts: [],
    watchedPackages: [],
    active: true,
    pairingVersion: 1,
    pairedDevice: { deviceId: 'd1', pairedAt: '2026-10-01T12:00:00.000Z' },
    deviceHistory: [],
    isOnline: true,
    smsRelay: relay(),
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('NotifierSmsRelay — respaldo por SMS en la tarjeta del celular', () => {
  let api: { setSmsRelay: ReturnType<typeof vi.fn> };

  function render(
    value: Notifier,
    canManage = true,
  ): { fixture: ComponentFixture<NotifierSmsRelay>; updated: Notifier[] } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: NotifiersApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(NotifierSmsRelay);
    fixture.componentRef.setInput('notifier', value);
    fixture.componentRef.setInput('canManage', canManage);
    const updated: Notifier[] = [];
    fixture.componentInstance.updated.subscribe((n) => updated.push(n));
    fixture.detectChanges();
    return { fixture, updated };
  }

  const el = (fixture: ComponentFixture<NotifierSmsRelay>) => fixture.nativeElement as HTMLElement;
  const text = (fixture: ComponentFixture<NotifierSmsRelay>) =>
    (el(fixture).textContent ?? '').replace(/\s+/g, ' ');
  const toggle = (fixture: ComponentFixture<NotifierSmsRelay>) =>
    el(fixture).querySelector<HTMLButtonElement>('[data-cy="sms-relay-toggle"]');
  const buttonByText = (fixture: ComponentFixture<NotifierSmsRelay>, label: string) =>
    Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button.yep-button')).find(
      (button) => (button.textContent ?? '').includes(label),
    );

  beforeEach(() => {
    api = {
      setSmsRelay: vi.fn().mockReturnValue(of({ notifier: notifier({ smsRelay: ACTIVE }) })),
    };
  });

  it('muestra el título y "Desactivado" si el dueño no lo autorizó', () => {
    const { fixture } = render(notifier());
    expect(text(fixture)).toContain('Respaldo por SMS cuando no hay internet');
    expect(el(fixture).querySelector('[data-testid="sms-relay-status"]')?.textContent?.trim()).toBe(
      'Desactivado',
    );
    expect(toggle(fixture)?.getAttribute('aria-checked')).toBe('false');
  });

  it('activo: pide el permiso de SMS en la app y muestra cuándo se autorizó', () => {
    const { fixture } = render(notifier({ smsRelay: ACTIVE }));
    expect(el(fixture).querySelector('[data-testid="sms-relay-status"]')?.textContent?.trim()).toBe(
      'Activo',
    );
    expect(text(fixture)).toContain('permiso de SMS en la app de YEP');
    expect(text(fixture)).toContain('Autorizado el');
    expect(toggle(fixture)?.getAttribute('aria-checked')).toBe('true');
  });

  it('autorizado pero YEP aún no lo ofrece: "No disponible todavía"', () => {
    const { fixture } = render(
      notifier({
        smsRelay: relay({ optedIn: true, globallyAvailable: false, status: 'unavailable' }),
      }),
    );
    expect(el(fixture).querySelector('[data-testid="sms-relay-status"]')?.textContent?.trim()).toBe(
      'No disponible todavía',
    );
    expect(text(fixture)).toContain('no se envía ningún SMS');
  });

  it('no se muestra para notificadores de correo o escritorio', () => {
    for (const type of ['email_gmail', 'desktop_app'] as const) {
      const { fixture } = render(notifier({ type, smsRelay: null }));
      expect(el(fixture).querySelector('[data-testid="sms-relay"]')).toBeNull();
    }
  });

  it('quien no es dueño ve el estado pero no el interruptor', () => {
    const { fixture } = render(notifier({ smsRelay: ACTIVE }), false);
    expect(el(fixture).querySelector('[data-testid="sms-relay"]')).not.toBeNull();
    expect(toggle(fixture)).toBeNull();
  });

  it('activar abre el consentimiento y solo envía tras marcar la autorización', () => {
    const { fixture, updated } = render(notifier());
    toggle(fixture)?.click();
    fixture.detectChanges();

    const consent = el(fixture).querySelector('[data-testid="sms-relay-consent"]');
    expect(consent?.textContent).toContain(SMS_RELAY_CONSENT_TEXT);
    expect(consent?.textContent).toContain(SMS_RELAY_CONSENT_CHECKBOX);
    const confirm = buttonByText(fixture, 'Activar respaldo');
    expect(confirm?.disabled).toBe(true);
    expect(api.setSmsRelay).not.toHaveBeenCalled();

    el(fixture)
      .querySelector<HTMLInputElement>('[data-cy="sms-relay-consent-check"]')
      ?.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(buttonByText(fixture, 'Activar respaldo')?.disabled).toBe(false);

    buttonByText(fixture, 'Activar respaldo')?.click();
    fixture.detectChanges();

    expect(api.setSmsRelay).toHaveBeenCalledWith('n1', {
      enabled: true,
      consentVersion: 'v1-2026-10',
    });
    expect(updated).toHaveLength(1);
    expect(updated[0].smsRelay?.optedIn).toBe(true);
    expect(el(fixture).querySelector('[data-testid="sms-relay-consent"]')).toBeNull();
  });

  it('cancelar el consentimiento no llama al backend', () => {
    const { fixture } = render(notifier());
    toggle(fixture)?.click();
    fixture.detectChanges();
    buttonByText(fixture, 'Cancelar')?.click();
    fixture.detectChanges();
    expect(el(fixture).querySelector('[data-testid="sms-relay-consent"]')).toBeNull();
    expect(api.setSmsRelay).not.toHaveBeenCalled();
  });

  it('desactivar llama al backend directo con enabled: false', () => {
    api.setSmsRelay.mockReturnValue(of({ notifier: notifier() }));
    const { fixture, updated } = render(notifier({ smsRelay: ACTIVE }));
    toggle(fixture)?.click();
    fixture.detectChanges();
    expect(api.setSmsRelay).toHaveBeenCalledWith('n1', { enabled: false });
    expect(updated[0].smsRelay?.optedIn).toBe(false);
  });

  it('muestra el error del backend', () => {
    api.setSmsRelay.mockReturnValue(
      throwError(() => ({ status: 400, error: { message: 'Solo notificadores de celular' } })),
    );
    const { fixture } = render(notifier({ smsRelay: ACTIVE }));
    toggle(fixture)?.click();
    fixture.detectChanges();
    expect(el(fixture).querySelector('[role="alert"]')).not.toBeNull();
  });

  it('smsRelayCopy: sin celular emparejado explica que se aplica al emparejar', () => {
    expect(smsRelayCopy(ACTIVE, false).hint).toContain('al emparejar');
    expect(smsRelayCopy(undefined, true).tone).toBe('disabled');
  });
});
