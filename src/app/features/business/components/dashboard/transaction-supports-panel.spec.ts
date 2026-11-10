import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import type {
  DataRequestEntry,
  PaymentSupport,
  PaymentTransaction,
} from '../../../../shared/models/transaction.models';
import { TransactionsApiService } from '../../../transactions/services/transactions-api.service';
import { TransactionSupportsPanel } from './transaction-supports-panel';

const transaction = (history: DataRequestEntry[] = []): PaymentTransaction =>
  ({
    id: 'tx1',
    status: 'PENDING_VERIFICATION',
    currency: 'COP',
    verification: { level: 'LOW', canBeConsideredPaid: false, status: 'PENDING_VERIFICATION' },
    dataRequest: { missingFields: [], status: 'resolved', history },
  }) as unknown as PaymentTransaction;

const support = (mimeType?: string): PaymentSupport =>
  ({
    id: 's1',
    type: 'OCR_RECEIPT',
    file: mimeType ? { mimeType } : undefined,
  }) as unknown as PaymentSupport;

const entry = (overrides: Partial<DataRequestEntry>): DataRequestEntry => ({
  field: 'reference',
  value: 'M0000001',
  at: '2026-11-05T15:00:00.000Z',
  via: 'whatsapp',
  byName: 'Nombre de prueba',
  ...overrides,
});

describe('TransactionSupportsPanel', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  function create(tx = transaction()): ComponentFixture<TransactionSupportsPanel> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: TransactionsApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(TransactionSupportsPanel);
    fixture.componentRef.setInput('transaction', tx);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = {
      listSupports: vi.fn().mockReturnValue(of({ paymentSupports: [] })),
      getSupportFileUrl: vi.fn().mockReturnValue(of({ url: 'https://archivo.test/r/1', expiresIn: 300 })),
    };
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('abrir el comprobante', () => {
    function open(mimeType?: string, url = 'https://archivo.test/r/1') {
      api['getSupportFileUrl'].mockReturnValue(of({ url, expiresIn: 300 }));
      const fixture = create();
      fixture.componentInstance.openReceipt(support(mimeType));
      fixture.detectChanges();
      return { fixture, element: fixture.nativeElement as HTMLElement };
    }

    it('una imagen se ve en img', () => {
      const { element } = open('image/jpeg');
      expect(element.querySelector('[data-testid="receipt-image"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="receipt-open-link"]')).toBeNull();
    });

    it('un PDF se abre con un enlace, sin img roto', () => {
      const { element } = open('application/pdf');
      expect(element.querySelector('[data-testid="receipt-image"]')).toBeNull();
      const link = element.querySelector<HTMLAnchorElement>('[data-testid="receipt-open-link"]');
      expect(link?.textContent).toContain('Abrir PDF');
      expect(link?.href).toBe('https://archivo.test/r/1');
      expect(link?.target).toBe('_blank');
      expect(link?.rel).toContain('noopener');
    });

    it('sin mimeType reconoce el PDF por la clave firmada', () => {
      const { element } = open(undefined, 'https://archivo.test/receipts/a/1.pdf?firma=abc');
      expect(element.querySelector('[data-testid="receipt-open-link"]')).not.toBeNull();
    });

    it('si la imagen no carga, ofrece el enlace', () => {
      const { fixture, element } = open('image/png');
      element.querySelector('[data-testid="receipt-image"]')?.dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="receipt-image"]')).toBeNull();
      expect(element.querySelector('[data-testid="receipt-open-link"]')?.textContent).toContain(
        'Abrir comprobante',
      );
    });

    it('al abrir otro vuelve a intentar la imagen', () => {
      const { fixture, element } = open('image/png');
      fixture.componentInstance.receiptImageFailed.set(true);
      fixture.componentInstance.closeReceipt();
      fixture.componentInstance.openReceipt(support('image/png'));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="receipt-image"]')).not.toBeNull();
    });

    it('nombra lo que se abre según el tipo', () => {
      const panel = create().componentInstance;
      expect(panel.openLabel(support('application/pdf'))).toBe('Ver PDF');
      expect(panel.openLabel(support('image/png'))).toBe('Ver foto');
    });
  });

  describe('historial de datos completados', () => {
    const detailOf = (history: DataRequestEntry[]) =>
      create(transaction(history)).componentInstance.manualEntries()[0].detail;

    it('muestra el valor: una referencia que no aparece ya no se ve como una escrita', () => {
      expect(detailOf([entry({ value: 'No aparece' })])).toContain('No aparece');
      expect(detailOf([entry({ value: 'M0000001' })])).toContain('M0000001');
    });

    it('muestra el monto como $ 48.000', () => {
      expect(detailOf([entry({ field: 'amount', value: '48000' })])).toContain('$ 48.000');
    });

    it('muestra la fecha legible, no en ISO', () => {
      expect(detailOf([entry({ field: 'transactionDate', value: '2026-11-05T15:00:00.000Z' })])).not.toContain(
        '2026-11-05T15',
      );
    });

    it('conserva quién y por qué canal', () => {
      const detail = detailOf([entry({})]);
      expect(detail).toContain('Nombre de prueba');
      expect(detail).toContain('WhatsApp');
    });
  });
});
