import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AuthSessionService } from '../../../../core/services/auth-session.service';
import type { TransactionExtractionResponse } from '../../../../shared/models/extraction.models';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { BanksApiService } from '../../../banks/services/banks-api.service';
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
        { provide: TransactionsApiService, useValue: {} },
        { provide: TransactionEventsService, useValue: { notifyChanged: vi.fn() } },
        { provide: NotificationModalService, useValue: { confirm: vi.fn() } },
        {
          provide: AuthSessionService,
          useValue: {
            activeMembership: () => ({ businessAccount: { name: 'Tienda de prueba' } }),
            isSuperUser: () => false,
          },
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

const RECEIPT_FILE = {
  key: 'receipts/a1/abc.jpg',
  hash: 'abc',
  mimeType: 'image/jpeg',
  sizeBytes: 1200,
};

const createdTransaction = { id: 'tx1', verification: { level: 'LOW' } };

describe('ReceiptCaptureModal: registrar el pago', () => {
  let transactions: Record<string, ReturnType<typeof vi.fn>>;
  let extractionApi: { extractReceipt: ReturnType<typeof vi.fn> };
  let role: string;

  function create(): ReceiptCaptureModal {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: BanksApiService, useValue: { list: vi.fn().mockReturnValue(of({ banks: [] })) } },
        { provide: ExtractionApiService, useValue: extractionApi },
        { provide: TransactionsApiService, useValue: transactions },
        { provide: TransactionEventsService, useValue: { notifyChanged: vi.fn() } },
        { provide: NotificationModalService, useValue: { confirm: vi.fn() } },
        {
          provide: AuthSessionService,
          useValue: {
            activeMembership: () => ({ role, businessAccount: { name: 'Tienda de prueba' } }),
            isSuperUser: () => false,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ReceiptCaptureModal);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  function readyToSave(): ReceiptCaptureModal {
    const modal = create();
    modal.extraction.set({ ...extraction('gpt-4o-mini'), file: RECEIPT_FILE });
    modal.manualForm.patchValue({ bankId: 'nequi', amount: 48000, reference: 'M0000001' });
    return modal;
  }

  const httpError = (status: number, error: unknown) =>
    throwError(() => new HttpErrorResponse({ status, error }));

  const pick = (file: File) => ({ target: { files: [file], value: '' } }) as unknown as Event;

  beforeEach(() => {
    role = 'account_owner';
    extractionApi = { extractReceipt: vi.fn().mockReturnValue(of(extraction('gpt-4o-mini'))) };
    transactions = {
      create: vi.fn().mockReturnValue(of({ action: 'CREATED', transaction: createdTransaction })),
      attachSupport: vi.fn().mockReturnValue(of({ action: 'CREATED', paymentSupport: {} })),
      runVerification: vi.fn().mockReturnValue(of({ transaction: createdTransaction, runs: [] })),
    };
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('crea la transacción sin evento OCR_UPLOAD y con la huella del archivo', () => {
    readyToSave().createTransaction();
    const [request] = transactions['create'].mock.calls[0];
    expect(request.fileHash).toBe('abc');
    expect(request.sourceEventId).toBeUndefined();
    expect(request.mechanismKind).toBe('ocr_extraction');
  });

  it('adjunta el comprobante con su foto y luego verifica', () => {
    const modal = readyToSave();
    modal.createTransaction();
    const [id, support] = transactions['attachSupport'].mock.calls[0];
    expect(id).toBe('tx1');
    expect(support.type).toBe('OCR_RECEIPT');
    expect(support.file).toEqual(RECEIPT_FILE);
    expect(support.sourceEventId).toBeUndefined();
    expect(transactions['runVerification']).toHaveBeenCalledWith('tx1', 'support_aggregation');
    expect(modal.success()).toContain('Transacción creada');
    expect(modal.warning()).toBe('');
  });

  it('si ya existía, no vuelve a adjuntar', () => {
    transactions['create'].mockReturnValue(
      of({ action: 'RETURNED_EXISTING', transaction: createdTransaction }),
    );
    const modal = readyToSave();
    modal.createTransaction();
    expect(transactions['attachSupport']).not.toHaveBeenCalled();
    expect(modal.success()).toContain('Ya existía');
  });

  it('con clave de archivo no válida adjunta sin foto, verifica y lo avisa', () => {
    transactions['attachSupport']
      .mockReturnValueOnce(httpError(400, { message: 'Clave de archivo no válida' }))
      .mockReturnValueOnce(of({ action: 'CREATED', paymentSupport: {} }));
    const modal = readyToSave();
    modal.createTransaction();
    expect(transactions['attachSupport']).toHaveBeenCalledTimes(2);
    expect(transactions['attachSupport'].mock.calls[1][1].file).toBeUndefined();
    expect(transactions['runVerification']).toHaveBeenCalled();
    expect(modal.error()).toBe('');
    expect(modal.warning()).toContain('la foto del comprobante no');
  });

  it('otro 400 al adjuntar se muestra y no se reintenta', () => {
    transactions['attachSupport'].mockReturnValue(httpError(400, { message: 'Algo distinto' }));
    const modal = readyToSave();
    modal.createTransaction();
    expect(transactions['attachSupport']).toHaveBeenCalledTimes(1);
    expect(modal.error()).toBe('Algo distinto');
  });

  it('sin OCR en el plan: al dueño lo manda a Suscripción', () => {
    extractionApi.extractReceipt.mockReturnValue(
      httpError(403, { code: 'PLAN_LIMIT_REACHED', reason: 'not_included', message: 'x' }),
    );
    const modal = create();
    modal.onReceiptSelected(pick(new File(['x'], 'pago.jpg', { type: 'image/jpeg' })));
    expect(modal.error()).toContain('Tu plan no incluye la lectura de comprobantes');
    expect(modal.error()).toContain('Suscripción');
  });

  it('cupo agotado: a un empleado le dice que hable con el dueño', () => {
    role = 'account_staff';
    extractionApi.extractReceipt.mockReturnValue(
      httpError(403, { code: 'PLAN_LIMIT_REACHED', reason: 'exhausted', message: 'x' }),
    );
    const modal = create();
    modal.onReceiptSelected(pick(new File(['x'], 'pago.png', { type: 'image/png' })));
    expect(modal.error()).toContain('ya usó las lecturas de comprobantes de este mes');
    expect(modal.error()).toContain('dueño');
    expect(modal.error()).not.toContain('Suscripción');
  });

  it('un 400 del OCR dice qué archivos sirven', () => {
    extractionApi.extractReceipt.mockReturnValue(
      httpError(400, { message: 'La imagen debe ser PNG, JPG o JPEG' }),
    );
    const modal = create();
    modal.onReceiptSelected(pick(new File(['x'], 'pago.jpg', { type: 'image/jpeg' })));
    expect(modal.error()).toContain('JPG o PNG de hasta 10 MB');
  });

  it('un PDF no se envía al OCR', () => {
    const modal = create();
    modal.onReceiptSelected(pick(new File(['x'], 'pago.pdf', { type: 'application/pdf' })));
    expect(extractionApi.extractReceipt).not.toHaveBeenCalled();
    expect(modal.error()).toContain('JPG o PNG de hasta 10 MB');
  });
});
