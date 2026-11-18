import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { AuthSessionService } from '../../../core/services/auth-session.service';
import { BillingStatusService } from '../../../core/services/billing-status.service';
import type { BusinessMembershipRole, SectionAccess } from '../../../shared/models/auth.models';
import type { SourceEvent } from '../../../shared/models/source-event.models';
import { BrowserPaymentAlertsService } from './browser-payment-alerts.service';
import { SourceEventsStreamService } from './source-events-stream.service';

const USER_PREFERENCE = 'yep_web.payment_alerts.user-1';

function report(id: string, overrides: Partial<SourceEvent> = {}): SourceEvent {
  return {
    id,
    accountId: 'business-1',
    sourceType: 'NOTIFIER_APP',
    status: 'received',
    rawPayload: {},
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('BrowserPaymentAlertsService', () => {
  let events: Subject<SourceEvent>;
  let service: BrowserPaymentAlertsService;
  let membership: ReturnType<
    typeof signal<{
      role: BusinessMembershipRole;
      sectionAccess?: Pick<SectionAccess, 'dashboardIncomeTable'>;
    }>
  >;
  let hidden: boolean;
  let notifications: TestNotification[];
  let requestPermission: ReturnType<typeof vi.fn<() => Promise<NotificationPermission>>>;

  class TestNotification {
    static permission: NotificationPermission;
    static requestPermission(): Promise<NotificationPermission> {
      return requestPermission();
    }

    onclick: (() => void) | null = null;
    readonly close = vi.fn();

    constructor(
      readonly title: string,
      readonly options: NotificationOptions,
    ) {
      notifications.push(this);
    }
  }

  beforeEach(() => {
    localStorage.clear();
    hidden = true;
    events = new Subject();
    notifications = [];
    TestNotification.permission = 'default';
    requestPermission = vi.fn(async () => (TestNotification.permission = 'granted'));
    vi.stubGlobal('Notification', TestNotification);
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    membership = signal({ role: 'account_owner' });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthSessionService,
          useValue: {
            user: signal({ id: 'user-1' }),
            accessToken: signal('token'),
            activeBusinessAccountId: signal('business-1'),
            activeMembership: membership,
            isSuperUser: signal(false),
          },
        },
        { provide: BillingStatusService, useValue: { isBlocked: signal(false) } },
        { provide: SourceEventsStreamService, useValue: { events$: events } },
      ],
    });
    service = TestBed.inject(BrowserPaymentAlertsService);
    TestBed.tick();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requests permission on opt-in and sends one alert for a payment in the background', async () => {
    events.next(report('opted-out'));
    expect(notifications).toHaveLength(0);
    expect(requestPermission).not.toHaveBeenCalled();

    await service.setEnabled(true);
    TestBed.tick();
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(localStorage.getItem(USER_PREFERENCE)).toBe('1');

    events.next(report('event-1', { linkPending: true }));
    expect(notifications).toHaveLength(0);
    events.next(report('event-1', { linkedTransactionId: 'payment-1', firstReport: true }));
    events.next(report('event-2', { linkedTransactionId: 'payment-1', firstReport: false }));
    events.next(report('event-1', { linkedTransactionId: 'payment-1', status: 'processed' }));

    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe('Pago recibido');
    expect(notifications[0].options.silent).toBe(true);

    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    notifications[0].onclick?.();
    expect(focus).toHaveBeenCalledOnce();
    expect(notifications[0].close).toHaveBeenCalledOnce();
  });

  it('skips new payments in the foreground and does not replay them in the background', async () => {
    await service.setEnabled(true);
    TestBed.tick();

    hidden = false;
    events.next(report('foreground'));
    hidden = true;
    events.next(report('foreground', { status: 'processed' }));
    expect(notifications).toHaveLength(0);

    events.next(report('background'));
    expect(notifications).toHaveLength(1);
  });

  it('keeps the setting off if the browser denies permission', async () => {
    requestPermission.mockResolvedValue('denied');

    expect(await service.setEnabled(true)).toBe('denied');
    expect(service.enabled()).toBe(false);
    expect(localStorage.getItem(USER_PREFERENCE)).toBeNull();
  });

  it('stops notifying immediately when disabled while keeping the browser permission', async () => {
    await service.setEnabled(true);
    TestBed.tick();
    await service.setEnabled(false);
    events.next(report('after-opt-out'));

    expect(notifications).toHaveLength(0);
    expect(localStorage.getItem(USER_PREFERENCE)).toBe('0');
    expect(TestNotification.permission).toBe('granted');
  });

  it('uses the active business and the same income-table permissions as the dashboard', async () => {
    await service.setEnabled(true);
    TestBed.tick();
    events.next(report('other-business', { accountId: 'business-2' }));
    events.next(report('receipt', { sourceType: 'OCR_UPLOAD' }));
    events.next(report('ignored', { status: 'ignored' }));

    membership.set({ role: 'account_staff', sectionAccess: { dashboardIncomeTable: false } });
    events.next(report('before-effect-cleanup'));
    TestBed.tick();
    events.next(report('staff-without-access'));

    expect(notifications).toHaveLength(0);
  });
});
