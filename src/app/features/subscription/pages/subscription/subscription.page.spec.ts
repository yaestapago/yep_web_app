import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import { BillingStatusService } from '../../../../core/services/billing-status.service';
import type {
  SubscriptionOverviewResponse,
  SubscriptionPlanSummary,
  UserSubscriptionSummary,
} from '../../../../shared/models/auth.models';
import type { ChangePlanResponse } from '../../../../shared/models/billing.models';
import { SubscriptionsApiService } from '../../services/subscriptions-api.service';
import { SubscriptionPage, billingPeriodChangeMessage } from './subscription.page';

function plan(overrides: Partial<SubscriptionPlanSummary>): SubscriptionPlanSummary {
  return {
    id: overrides.code ?? 'plan',
    code: 'pro',
    name: 'Pro',
    priceCop: 90000,
    annualPriceCop: 900000,
    currency: 'COP',
    billingPeriod: 'monthly',
    quotas: {
      maxBusinesses: 1,
      maxLocations: 1,
      maxUsers: 3,
      maxMonthlySourceEventsVisible: -1,
      maxMonthlyWhatsappNotifications: 100,
      maxWhatsappRecipients: 3,
      maxBankAccounts: 3,
      maxMonthlyAiTransactionValidations: 10,
    },
    retention: { sourceEventsDays: 90 },
    features: { posIntegration: false, automaticComparison: false },
    supportLevel: 'standard',
    isCustom: false,
    ...overrides,
  };
}

const proPlan = plan({ code: 'pro', name: 'Pro' });
const basicPlan = plan({ code: 'basic', name: 'Básico', priceCop: 50000, annualPriceCop: 500000 });
const proPlusPlan = plan({
  code: 'pro_plus',
  name: 'Pro+',
  priceCop: 0,
  annualPriceCop: null,
  isCustom: true,
});

function subscription(overrides: Partial<UserSubscriptionSummary> = {}): UserSubscriptionSummary {
  return {
    id: 'sub-1',
    status: 'active',
    plan: proPlan,
    startsAt: '2026-09-05T05:00:00.000Z',
    currentPeriodStart: '2026-10-05T05:00:00.000Z',
    currentPeriodEnd: '2026-11-05T05:00:00.000Z',
    billingPeriod: 'monthly',
    contractedPriceCop: 90000,
    currentPeriodInvoiceId: null,
    whatsappTopUpBalance: 0,
    recurringAddOnsCop: 0,
    pendingChange: null,
    pendingBillingPeriod: null,
    pendingBillingPeriodEffectiveAt: null,
    blockedAt: null,
    blockReason: null,
    ...overrides,
  };
}

function changePlanResponse(overrides: Partial<ChangePlanResponse>): ChangePlanResponse {
  return {
    type: 'same_plan',
    currentPlan: { code: 'pro', name: 'Pro', priceCop: 90000 },
    newPlan: { code: 'pro', name: 'Pro', priceCop: 90000 },
    currentPeriodEnd: '2026-11-05T05:00:00.000Z',
    proratedAmountCop: 0,
    currency: 'COP',
    paymentRequired: false,
    changeRequestId: null,
    invoiceId: null,
    billingPeriodChange: null,
    ...overrides,
  };
}

describe('SubscriptionPage — ciclo de pago mensual / anual', () => {
  let overview: SubscriptionOverviewResponse;
  let api: {
    overview: ReturnType<typeof vi.fn>;
    myChangeRequests: ReturnType<typeof vi.fn>;
    addonPricing: ReturnType<typeof vi.fn>;
    changePlan: ReturnType<typeof vi.fn>;
  };

  function create(sub: UserSubscriptionSummary): ComponentFixture<SubscriptionPage> {
    overview = {
      subscription: sub,
      usage: [],
      alerts: [],
      availablePlans: [basicPlan, proPlan, proPlusPlan],
    };
    api.overview.mockImplementation(() => of(overview));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SubscriptionsApiService, useValue: api },
        {
          provide: AuthSessionService,
          useValue: { subscription: signal(null), updateSubscription: vi.fn() },
        },
        { provide: BillingStatusService, useValue: { refresh: vi.fn().mockResolvedValue(null) } },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(SubscriptionPage);
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<SubscriptionPage>): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
  }

  beforeEach(() => {
    api = {
      overview: vi.fn(),
      myChangeRequests: vi.fn().mockReturnValue(of([])),
      addonPricing: vi.fn().mockReturnValue(of({ whatsapp: [], locations: [], users: [] })),
      changePlan: vi.fn(),
    };
  });

  afterEach(() => vi.restoreAllMocks());

  it('muestra el ciclo actual en el resumen y ofrece cambiar a anual', () => {
    const fixture = create(subscription());

    expect(text(fixture)).toContain('Ciclo de pago: Mensual · 90.000 COP');
    expect(fixture.componentInstance.billingPeriodSwitchLabel()).toBe('Cambiar a anual');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-cy="subscription-switch-billing-period"]',
      ),
    ).not.toBeNull();
  });

  it('cambiar solo el ciclo envía el plan actual + anual y muestra cuándo aplica', () => {
    const fixture = create(subscription());
    const page = fixture.componentInstance;
    api.changePlan.mockReturnValue(
      of(
        changePlanResponse({
          type: 'billing_period_change',
          billingPeriodChange: { billingPeriod: 'annual', effectiveAt: '2026-11-05T05:00:00.000Z' },
        }),
      ),
    );

    page.openBillingPeriodSwitch();
    fixture.detectChanges();

    expect(page.requestModalOpen()).toBe(true);
    expect(page.selectedPlanCode()).toBe('pro');
    expect(page.selectedBillingPeriod()).toBe('annual');
    expect(page.monthlyOptionLabel()).toBe('Mensual — 90.000 COP / mes');
    expect(page.annualOptionLabel()).toBe('Anual (paga 10, recibe 12) — 900.000 COP / año');

    page.submitRequest();
    fixture.detectChanges();

    expect(api.changePlan).toHaveBeenCalledWith('pro', 'annual');
    expect(page.success()).toBe(
      'Tu plan pasará a anual el 5 de noviembre de 2026. ' +
        'La cuenta de cobro de ese periodo (12 meses) se genera 5 días antes.',
    );
    expect(text(fixture)).toContain('Tu plan pasará a anual el 5 de noviembre de 2026.');
  });

  it('el cambio de plan siempre envía el ciclo elegido', () => {
    const fixture = create(subscription());
    const page = fixture.componentInstance;
    api.changePlan.mockReturnValue(
      of(
        changePlanResponse({
          type: 'downgrade',
          newPlan: { code: 'basic', name: 'Básico', priceCop: 50000 },
        }),
      ),
    );

    page.openPlanChangeModal(basicPlan);
    expect(page.selectedBillingPeriod()).toBe('monthly');
    page.submitRequest();

    expect(api.changePlan).toHaveBeenCalledWith('basic', 'monthly');
  });

  it('con un cambio de ciclo agendado muestra el aviso y permite mantener el ciclo actual', () => {
    const fixture = create(
      subscription({
        pendingBillingPeriod: 'annual',
        pendingBillingPeriodEffectiveAt: '2026-11-05T05:00:00.000Z',
      }),
    );
    const page = fixture.componentInstance;

    const alert = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-cy="subscription-pending-billing-period"]',
    );
    expect(alert?.textContent?.replace(/\s+/g, ' ')).toContain(
      'Pasarás a plan anual el 5 de noviembre de 2026.',
    );
    expect(page.billingPeriodSwitchLabel()).toBe('Mantener ciclo mensual');

    api.changePlan.mockReturnValue(of(changePlanResponse({ type: 'same_plan' })));
    page.openBillingPeriodSwitch();
    expect(page.selectedBillingPeriod()).toBe('monthly');
    page.submitRequest();

    expect(api.changePlan).toHaveBeenCalledWith('pro', 'monthly');
    expect(page.success()).toBe('Se mantiene tu ciclo mensual.');
  });

  it('un plan a la medida (Pro+) no permite cambiar el ciclo', () => {
    const fixture = create(subscription({ plan: proPlusPlan, contractedPriceCop: 450000 }));

    expect(fixture.componentInstance.canSwitchBillingPeriod()).toBe(false);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-cy="subscription-switch-billing-period"]',
      ),
    ).toBeNull();
  });

  it('formatea el paso a mensual con un periodo de 1 mes', () => {
    expect(
      billingPeriodChangeMessage({
        billingPeriod: 'monthly',
        effectiveAt: '2027-10-05T05:00:00.000Z',
      }),
    ).toBe(
      'Tu plan pasará a mensual el 5 de octubre de 2027. ' +
        'La cuenta de cobro de ese periodo (1 mes) se genera 5 días antes.',
    );
  });
});
