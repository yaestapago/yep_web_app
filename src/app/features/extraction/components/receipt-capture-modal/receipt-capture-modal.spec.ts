import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { TransactionExtractionResponse } from '../../../../shared/models/extraction.models';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { BanksApiService } from '../../../banks/services/banks-api.service';
import { SourceEventsApiService } from '../../../source-events/services/source-events-api.service';
import { TransactionEventsService } from '../../../transactions/services/transaction-events.service';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';
import { ExtractionApiService } from '../../services/extraction-api.service';
import { ReceiptCaptureModal } from './receipt-capture-modal';

const extraction = (model: string, bank: string | null = 'nequi'): TransactionExtractionResponse => ({
  model,
  transaction: {
    isTransactionReceipt: true,
    bank,
    amount: 48000,
    currency: 'COP',
    dateTime: '2026-11-05T14:30:00.000Z',
    sender: { name: null, account: null },
    receiver: { name: null, account: null },
    reference: 'M0000001',
    status: null,
    confidence: 1,
    rawText: null,
  },
});

describe('ReceiptCaptureModal: revisión del OCR', () => {
  let banks: { list: ReturnType<typeof vi.fn> };

  function review(response: TransactionExtractionResponse): {
    fixture: ComponentFixture<ReceiptCaptureModal>;
    text: () => string;
  } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: BanksApiService, useValue: banks },
        { provide: ExtractionApiService, useValue: {} },
        { provide: SourceEventsApiService, useValue: {} },
        { provide: TransactionsApiService, useValue: {} },
        { provide: TransactionEventsService, useValue: { notifyChanged: vi.fn() } },
        { provide: NotificationModalService, useValue: { confirm: vi.fn() } },
        {
          provide: AuthSessionService,
          useValue: { activeMembership: () => ({ businessAccount: { name: 'Tienda de prueba' } }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(ReceiptCaptureModal);
    fixture.componentInstance.step.set('review');
    fixture.componentInstance.extraction.set(response);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    return { fixture, text: () => (fixture.nativeElement as HTMLElement).textContent ?? '' };
  }

  beforeEach(() => {
    banks = {
      list: vi.fn().mockReturnValue(of({ banks: [{ code: 'nequi', name: 'Nequi' }] })),
    };
  });

  afterEach(() => TestBed.resetTestingModule());

  it('con reglas dice "Datos leídos", no "Confianza"', () => {
    const { text } = review(extraction('rules'));
    expect(text()).toContain('Datos leídos');
    expect(text()).not.toContain('Confianza');
  });

  it('con IA sigue diciendo "Confianza"', () => {
    const { text } = review(extraction('gpt-4o-mini'));
    expect(text()).toContain('Confianza');
    expect(text()).not.toContain('Datos leídos');
  });

  it('muestra el nombre del banco, no su código', () => {
    const { fixture } = review(extraction('rules'));
    expect(fixture.componentInstance.bankName()).toBe('Nequi');
  });

  it('sin importar mayúsculas', () => {
    const { fixture } = review(extraction('rules', 'NEQUI'));
    expect(fixture.componentInstance.bankName()).toBe('Nequi');
  });

  it('un banco que no está en el catálogo se muestra como llegó', () => {
    const { fixture } = review(extraction('gpt-4o-mini', 'Banco Nuevo'));
    expect(fixture.componentInstance.bankName()).toBe('Banco Nuevo');
  });

  it('sin banco dice "Sin datos"', () => {
    const { fixture } = review(extraction('rules', null));
    expect(fixture.componentInstance.bankName()).toBe('Sin datos');
  });

  it('si el catálogo falla, muestra el código y no impide seguir', () => {
    banks.list.mockReturnValue(throwError(() => new Error('sin red')));
    const { fixture } = review(extraction('rules'));
    expect(fixture.componentInstance.bankName()).toBe('nequi');
  });

  it('el formulario sigue enviando el código', () => {
    const { fixture } = review(extraction('rules'));
    const code = (fixture.nativeElement as HTMLElement).textContent;
    expect(code).toContain('Código del banco');
  });
});
