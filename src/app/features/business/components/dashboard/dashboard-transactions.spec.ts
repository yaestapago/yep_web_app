import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { BusinessMembershipRole } from '../../../../shared/models/auth.models';
import type { PaymentTransaction } from '../../../../shared/models/transaction.models';
import { DashboardTransactionsPanel } from './dashboard-transactions';

const pending = {
  id: 'tx1',
  status: 'PENDING_VERIFICATION',
  verification: { level: 'MEDIUM', canBeConsideredPaid: false, status: 'PENDING_VERIFICATION' },
} as PaymentTransaction;

const verified = {
  id: 'tx2',
  status: 'MANUALLY_VERIFIED',
  verification: { level: 'HIGH', canBeConsideredPaid: true, status: 'MANUALLY_VERIFIED' },
} as PaymentTransaction;

describe('DashboardTransactionsPanel: quién ve Verificar en la fila', () => {
  function create(role: BusinessMembershipRole | null, isSuperUser = false): DashboardTransactionsPanel {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthSessionService,
          useValue: { activeMembership: signal(role ? { role } : null), isSuperUser: signal(isSuperUser) },
        },
      ],
    });
    const fixture = TestBed.createComponent(DashboardTransactionsPanel);
    fixture.componentRef.setInput('transactions', [pending, verified]);
    return fixture.componentInstance;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('el dueño y el super-usuario pueden verificar un pago pendiente', () => {
    expect(create('account_owner').isActionable(pending)).toBe(true);
    expect(create(null, true).isActionable(pending)).toBe(true);
  });

  it('el empleado no ve Verificar, pero sí Aplicar a factura', () => {
    const list = create('account_staff');
    expect(list.isActionable(pending)).toBe(false);
    expect(list.isInvoiceActionable(verified)).toBe(true);
  });
});
