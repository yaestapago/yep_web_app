import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import type {
  CompleteDataResponse,
  PaymentTransaction,
} from '../../../../shared/models/transaction.models';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';
import { TransactionDetailModal } from './transaction-detail-modal';

const transaction = (overrides: Partial<PaymentTransaction> = {}): PaymentTransaction =>
  ({
    id: 'tx1',
    accountId: 'a1',
    bankId: 'nequi',
    transactionDate: '2026-11-05T15:00:00.000Z',
    amount: 48000,
    currency: 'COP',
    dayBucket: '2026-11-05',
    status: 'NEEDS_INPUT',
    verification: { level: 'LOW', canBeConsideredPaid: false, status: 'NEEDS_INPUT' },
    createdByMechanismId: 'm1',
    createdAt: '2026-11-05T15:00:00.000Z',
    updatedAt: '2026-11-05T15:00:00.000Z',
    dataRequest: {
      missingFields: ['amount', 'transactionDate', 'receiverAccount'],
      status: 'pending',
      history: [],
    },
    ...overrides,
  }) as PaymentTransaction;

describe('TransactionDetailModal: datos faltantes', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  function create(): ComponentFixture<TransactionDetailModal> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: TransactionsApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(TransactionDetailModal);
    fixture.componentRef.setInput('transaction', transaction());
    fixture.detectChanges();
    return fixture;
  }

  const respond = (rejected: string[], applied: string[] = []): CompleteDataResponse =>
    ({ transaction: transaction(), applied, rejected, resolved: false }) as unknown as CompleteDataResponse;

  beforeEach(() => {
    api = {
      completeData: vi.fn().mockReturnValue(of(respond([]))),
      listSupports: vi.fn().mockReturnValue(of({ paymentSupports: [] })),
    };
  });

  afterEach(() => TestBed.resetTestingModule());

  it('dice qué formato acepta cada dato, con la hora obligatoria', () => {
    const text = (create().nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('$ 48.000');
    expect(text).toContain('05/07/2026 3:45 pm');
    expect(text).toContain('La hora es obligatoria');
  });

  it('los ejemplos usan el formato de la marca', () => {
    const modal = create().componentInstance;
    expect(modal.fieldPlaceholder('amount')).toBe('Ej. $ 48.000');
    expect(modal.fieldPlaceholder('transactionDate')).toBe('Ej. 05/07/2026 3:45 pm');
  });

  it('no borra lo que el servidor rechazó, y sí lo que aplicó', () => {
    api['completeData'].mockReturnValue(of(respond(['transactionDate'], ['amount'])));
    const fixture = create();
    const modal = fixture.componentInstance;
    modal.setFormValue('amount', '$ 48.000');
    modal.setFormValue('transactionDate', '05/07/2026');
    modal.submitCompleteData();
    fixture.detectChanges();

    expect(modal.formValue('transactionDate')).toBe('05/07/2026');
    expect(modal.formValue('amount')).toBe('');
    expect(modal.isRejected('transactionDate')).toBe(true);
    expect(modal.completeError()).toContain('Fecha y hora');
  });

  it('escribir de nuevo quita la marca de rechazado', () => {
    api['completeData'].mockReturnValue(of(respond(['amount'])));
    const modal = create().componentInstance;
    modal.setFormValue('amount', 'mil');
    modal.submitCompleteData();
    expect(modal.isRejected('amount')).toBe(true);
    modal.setFormValue('amount', '$ 1.000');
    expect(modal.isRejected('amount')).toBe(false);
  });

  it('si no hubo rechazos deja el formulario limpio', () => {
    const modal = create().componentInstance;
    modal.setFormValue('amount', '$ 48.000');
    modal.submitCompleteData();
    expect(modal.formValue('amount')).toBe('');
    expect(modal.completeError()).toBe('');
  });

  it('avisa si escriben solo los últimos 4 de la cuenta, sin impedirlo', () => {
    const fixture = create();
    const modal = fixture.componentInstance;
    modal.setFormValue('receiverAccount', '1234');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="short-account-warning"]')
        ?.textContent,
    ).toContain('guardamos solo esos');
    expect(modal.canSubmit()).toBe(true);

    modal.setFormValue('receiverAccount', '12345678901');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="short-account-warning"]'),
    ).toBeNull();
  });
});
