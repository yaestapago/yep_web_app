import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, of } from 'rxjs';
import { InvoicesAdminPage } from './invoices-admin.page';
import { AdminInvoicesApiService } from '../../services/admin-invoices-api.service';
import type { BillingInvoiceSummary } from '../../../../shared/models/billing.models';

describe('InvoicesAdminPage PDF', () => {
  let response: Subject<{ url: string; filename: string; expiresInSeconds: number }>;
  let page: InvoicesAdminPage;
  const api = { generatePdf: vi.fn(), list: () => of([]) };
  const invoice = { id: 'invoice-1', canGeneratePdf: true } as BillingInvoiceSummary;
  beforeEach(() => {
    response = new Subject();
    api.generatePdf.mockReset().mockReturnValue(response);
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminInvoicesApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    page = TestBed.runInInjectionContext(() => new InvoicesAdminPage());
  });
  afterEach(() => vi.restoreAllMocks());
  it('renders the primary PDF button and disables it while generating', () => {
    const fixture = TestBed.createComponent(InvoicesAdminPage);
    const validInvoice = {
      ...invoice,
      invoiceNumber: 'YEP-0000001',
      items: [],
      totalCop: 100,
      status: 'issued',
    } as BillingInvoiceSummary;
    fixture.componentInstance.openInvoice(validInvoice);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '.invoice-detail__pdf button',
    ) as HTMLButtonElement;
    expect(button.textContent).toContain('Generar PDF');
    expect(button.classList.contains('yep-button--secondary')).toBe(false);
    expect(button.querySelector('svg')).not.toBeNull();
    button.click();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Generando');
    response.complete();
  });
  it('distinguishes an outdated backend from missing historical data', () => {
    const fixture = TestBed.createComponent(InvoicesAdminPage);
    fixture.componentInstance.openInvoice({
      ...invoice,
      canGeneratePdf: undefined,
      items: [],
      totalCop: 100,
    } as BillingInvoiceSummary);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Actualiza el backend');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'no conserva los datos',
    );
    fixture.componentInstance.openInvoice({
      ...invoice,
      canGeneratePdf: false,
      items: [],
      totalCop: 100,
    } as BillingInvoiceSummary);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('no conserva los datos');
  });
  it('prevents duplicate requests and keeps the detail open during generation', () => {
    page.openInvoice(invoice);
    page.generatePdf(invoice);
    page.generatePdf(invoice);
    page.closeInvoice();
    expect(api.generatePdf).toHaveBeenCalledTimes(1);
    expect(page.generatingPdf()).toBe(true);
    expect(page.selectedInvoice()).toBe(invoice);
    response.complete();
    expect(page.generatingPdf()).toBe(false);
    page.closeInvoice();
    expect(page.selectedInvoice()).toBeNull();
  });
  it('downloads the URL and filename returned by the server', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.href).toBe('https://example.com/private.pdf');
      expect(this.download).toBe('cuenta-de-cobro-YEP-0000001.pdf');
    });
    page.generatePdf(invoice);
    response.next({
      url: 'https://example.com/private.pdf',
      filename: 'cuenta-de-cobro-YEP-0000001.pdf',
      expiresInSeconds: 900,
    });
    response.complete();
    expect(click).toHaveBeenCalledTimes(1);
    expect(page.generatingPdf()).toBe(false);
  });
  it('shows a generation failure and permits retry', () => {
    page.generatePdf(invoice);
    response.error(new Error('Error'));
    expect(page.pdfError()).not.toBe('');
    expect(page.generatingPdf()).toBe(false);
    api.generatePdf.mockReturnValue(new Subject());
    page.generatePdf(invoice);
    expect(api.generatePdf).toHaveBeenCalledTimes(2);
    expect(page.pdfError()).toBe('');
  });
  it('does not request PDFs for invoices without historical data', () => {
    page.generatePdf({ ...invoice, canGeneratePdf: false });
    expect(api.generatePdf).not.toHaveBeenCalled();
  });
});
