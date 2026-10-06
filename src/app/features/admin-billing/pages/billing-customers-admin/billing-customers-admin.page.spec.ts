import type {
  BillingCustomerNotice,
  BillingCustomerRow,
} from '../../../../shared/models/billing-status.models';
import {
  buildNoticeChips,
  compareBillingRows,
  matchesBillingFilter,
  toBillingCustomerView,
} from './billing-customers-admin.page';

function row(overrides: Partial<BillingCustomerRow>): BillingCustomerRow {
  return {
    accountId: overrides.accountId ?? 'a',
    businessName: 'Negocio',
    planCode: 'pro',
    planName: 'Pro',
    phase: 'paid',
    status: 'active',
    state: 'ok',
    reason: null,
    deadline: null,
    daysLeft: null,
    blockedAt: null,
    contractedPriceCop: 90000,
    billingPeriod: 'monthly',
    currentInvoice: null,
    owners: [],
    notices: [],
    ...overrides,
  };
}

function notice(overrides: Partial<BillingCustomerNotice>): BillingCustomerNotice {
  return {
    kind: 'reminder_5d',
    createdAt: '2026-10-01T14:00:00.000Z',
    recipientName: 'Ana',
    whatsapp: { status: 'sent', reason: null },
    email: { status: 'sent', reason: null },
    ...overrides,
  };
}

describe('BillingCustomersAdminPage helpers', () => {
  it('sorts blocked first, then due soon by days left, then payment review, then the rest', () => {
    const rows = [
      row({ accountId: 'ok', state: 'ok', daysLeft: 20 }),
      row({ accountId: 'review', state: 'payment_review', daysLeft: 1 }),
      row({ accountId: 'due-4', state: 'due_soon', daysLeft: 4 }),
      row({ accountId: 'blocked', state: 'blocked', daysLeft: -3 }),
      row({ accountId: 'due-1', state: 'due_soon', daysLeft: 1 }),
    ];

    expect([...rows].sort(compareBillingRows).map((item) => item.accountId)).toEqual([
      'blocked',
      'due-1',
      'due-4',
      'review',
      'ok',
    ]);
  });

  it('filters by state and phase', () => {
    const trialDueSoon = row({ phase: 'trial', state: 'due_soon' });
    const paidOk = row({ phase: 'paid', state: 'ok' });

    expect(matchesBillingFilter(trialDueSoon, 'trial')).toBe(true);
    expect(matchesBillingFilter(trialDueSoon, 'due_soon')).toBe(true);
    expect(matchesBillingFilter(trialDueSoon, 'ok')).toBe(false);
    expect(matchesBillingFilter(paidOk, 'ok')).toBe(true);
    expect(matchesBillingFilter(paidOk, 'blocked')).toBe(false);
    expect(matchesBillingFilter(paidOk, 'all')).toBe(true);
  });

  it('builds one chip per notice kind aggregating channels', () => {
    const chips = buildNoticeChips([
      notice({ kind: 'reminder_2d', whatsapp: { status: 'failed', reason: 'sin teléfono' } }),
      notice({
        kind: 'reminder_5d',
        recipientName: 'Ana',
        email: { status: 'skipped', reason: 'sin correo' },
      }),
      notice({
        kind: 'reminder_5d',
        recipientName: 'Luis',
        whatsapp: { status: 'failed', reason: 'número inválido' },
        email: { status: 'skipped', reason: null },
      }),
    ]);

    expect(chips.map((chip) => chip.kind)).toEqual(['reminder_5d', 'reminder_2d']);
    expect(chips[0].whatsapp.symbol).toBe('✓');
    expect(chips[0].email.symbol).toBe('–');
    expect(chips[0].title).toContain('Luis');
    expect(chips[0].title).toContain('número inválido');
    expect(chips[1].whatsapp.symbol).toBe('✗');
    expect(chips[1].hasFailure).toBe(true);
  });

  it('formats money, overdue days and blocked rows for the table', () => {
    const blocked = toBillingCustomerView(
      row({
        state: 'blocked',
        reason: 'payment_overdue',
        status: 'suspended',
        blockedAt: '2026-10-01T15:00:00.000Z',
        currentInvoice: { id: 'i1', invoiceNumber: 'YEP-1', totalCop: 90000, status: 'issued' },
      }),
    );
    expect(blocked.stateLabel).toBe('Bloqueado');
    expect(blocked.daysTone).toBe('overdue');
    expect(blocked.daysLabel).toContain('Bloqueado desde');
    expect(blocked.planDetail).toBe('Mensual · $90.000');
    expect(blocked.invoiceStatusLabel).toBe('Pendiente');
    expect(blocked.detailLabel).toContain('Cuenta de cobro vencida');

    const overdue = toBillingCustomerView(row({ state: 'ok', daysLeft: -2 }));
    expect(overdue.daysLabel).toBe('Vencida hace 2 días');
    expect(overdue.daysTone).toBe('overdue');

    const trial = toBillingCustomerView(row({ phase: 'trial', state: 'ok', contractedPriceCop: 0 }));
    expect(trial.stateLabel).toBe('En prueba');
    expect(trial.planDetail).toBe('Prueba gratis');
  });
});
