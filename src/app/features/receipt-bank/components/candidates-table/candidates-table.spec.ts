import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import type { ReceiptCandidate } from '../../../../shared/models/receipt-bank.models';
import { ReceiptBankApiService } from '../../services/receipt-bank-api.service';
import { CandidatesTable } from './candidates-table';

const candidate = (overrides: Partial<ReceiptCandidate> = {}): ReceiptCandidate => ({
  paymentSupportId: 's1',
  accountId: 'a1',
  accountName: 'Tienda de prueba',
  createdAt: '2026-11-01T15:00:00.000Z',
  mimeType: 'image/png',
  sizeBytes: 1000,
  issuerHint: 'Nequi',
  method: 'ai',
  fallbackReason: 'no_match',
  alreadySelected: false,
  ...overrides,
});

describe('CandidatesTable', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  function create(): ComponentFixture<CandidatesTable> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ReceiptBankApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(CandidatesTable);
    fixture.detectChanges();
    return fixture;
  }

  const element = (fixture: ComponentFixture<CandidatesTable>) => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    api = {
      listCandidates: vi.fn().mockReturnValue(of({ candidates: [candidate()], nextCursor: null })),
      candidateFileUrl: vi.fn().mockReturnValue(of({ url: 'https://archivo.test/s1', expiresIn: 300 })),
      selectCandidate: vi.fn().mockReturnValue(of({ example: { id: 'e1' }, alreadySelected: false })),
    };
  });

  afterEach(() => TestBed.resetTestingModule());

  it('avisa que son datos personales de terceros y que requiere autorización, sin bloquear', () => {
    const fixture = create();
    const notice = element(fixture).querySelector('[data-testid="third-party-notice"]')?.textContent ?? '';
    expect(notice).toContain('Datos personales de terceros');
    expect(notice).toContain('autorización confirmada');
    expect(element(fixture).querySelectorAll('[data-testid="candidate-row"]')).toHaveLength(1);
  });

  it('el aviso sigue visible cuando no hay comprobantes', () => {
    api['listCandidates'].mockReturnValue(of({ candidates: [], nextCursor: null }));
    const fixture = create();
    expect(element(fixture).querySelector('[data-testid="third-party-notice"]')).not.toBeNull();
    expect(element(fixture).textContent).toContain('Todavía no hay comprobantes de clientes');
  });

  it('muestra cómo se leyó y el motivo en palabras', () => {
    const fixture = create();
    const row = element(fixture).querySelector('[data-testid="candidate-row"]')?.textContent ?? '';
    expect(row).toContain('Tienda de prueba');
    expect(row).toContain('IA');
    expect(row).toContain('No reconocimos el comprobante');
    expect(row).not.toContain('no_match');
  });

  it('manda los filtros al buscar, y no al escribir: cada consulta deja bitácora', () => {
    const table = create().componentInstance;
    expect(api['listCandidates']).toHaveBeenCalledTimes(1);

    table.issuerHint.set('Nequi');
    table.fallbackReason.set('no_match');
    table.onlyUnselected.set(true);
    table.accountId.set('a1');
    expect(api['listCandidates']).toHaveBeenCalledTimes(1);

    table.search();
    const query = api['listCandidates'].mock.calls[1][0];
    expect(query).toMatchObject({
      issuerHint: 'Nequi',
      fallbackReason: 'no_match',
      onlyUnselected: true,
      accountId: 'a1',
    });
    expect(query.from).toBeTruthy();
    expect(query.to).toBeTruthy();
    expect(query.cursor).toBeUndefined();
  });

  it('la pista de banco no admite dígitos: no consulta', () => {
    const table = create().componentInstance;
    table.issuerHint.set('Nequi 123');
    table.search();
    expect(table.issuerHintError()).toBeTruthy();
    expect(api['listCandidates']).toHaveBeenCalledTimes(1);
  });

  it('pagina por cursor y agrega a lo que ya hay', () => {
    api['listCandidates'].mockReturnValueOnce(of({ candidates: [candidate()], nextCursor: 'c2' }));
    api['listCandidates'].mockReturnValueOnce(
      of({
        candidates: [candidate({ paymentSupportId: 's2', accountId: 'a2', accountName: 'Otra tienda' })],
        nextCursor: null,
      }),
    );
    const table = create().componentInstance;
    table.loadMore();

    expect(api['listCandidates'].mock.calls[1][0].cursor).toBe('c2');
    expect(table.candidates().map((item) => item.paymentSupportId)).toEqual(['s1', 's2']);
    expect(table.nextCursor()).toBeNull();
    expect(table.accountOptions().map((option) => option.label)).toEqual([
      'Tienda de prueba',
      'Otra tienda',
    ]);
  });

  it('escoger crea el borrador, marca la fila y pide abrirlo; no confirma nada', () => {
    const table = create().componentInstance;
    const chosen = vi.fn();
    table.exampleChosen.subscribe(chosen);
    table.choose(table.candidates()[0]);

    expect(api['selectCandidate']).toHaveBeenCalledWith('s1');
    expect(chosen).toHaveBeenCalledWith({ exampleId: 'e1', alreadySelected: false });
    expect(table.candidates()[0].alreadySelected).toBe(true);
  });

  it('escoger otra vez devuelve el mismo borrador', () => {
    api['selectCandidate'].mockReturnValue(of({ example: { id: 'e1' }, alreadySelected: true }));
    const table = create().componentInstance;
    const chosen = vi.fn();
    table.exampleChosen.subscribe(chosen);
    table.choose(table.candidates()[0]);
    expect(chosen).toHaveBeenCalledWith({ exampleId: 'e1', alreadySelected: true });
  });

  it('un error al escoger se muestra y no marca la fila', () => {
    api['selectCandidate'].mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 409, error: { message: 'Ese archivo ya entró por otro soporte.' } }),
      ),
    );
    const table = create().componentInstance;
    table.choose(table.candidates()[0]);
    expect(table.actionError()).toContain('otro soporte');
    expect(table.candidates()[0].alreadySelected).toBe(false);
    expect(table.choosingId()).toBeNull();
  });

  describe('ver el comprobante', () => {
    it('una imagen se ve en img', () => {
      const fixture = create();
      fixture.componentInstance.view(fixture.componentInstance.candidates()[0]);
      fixture.detectChanges();
      fixture.detectChanges();
      expect(api['candidateFileUrl']).toHaveBeenCalledWith('s1');
      expect(element(fixture).querySelector('[data-testid="receipt-image"]')).not.toBeNull();
    });

    it('un PDF se abre con un enlace', () => {
      api['listCandidates'].mockReturnValue(
        of({ candidates: [candidate({ mimeType: 'application/pdf' })], nextCursor: null }),
      );
      const fixture = create();
      fixture.componentInstance.view(fixture.componentInstance.candidates()[0]);
      fixture.detectChanges();
      fixture.detectChanges();
      expect(element(fixture).querySelector('[data-testid="receipt-image"]')).toBeNull();
      expect(
        element(fixture).querySelector<HTMLAnchorElement>('[data-testid="receipt-open-link"]')?.href,
      ).toBe('https://archivo.test/s1');
    });

    it('un error al pedir la URL se muestra', () => {
      api['candidateFileUrl'].mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 503, error: { message: 'Sin almacenamiento' } })),
      );
      const table = create().componentInstance;
      table.view(table.candidates()[0]);
      expect(table.viewError()).toBe('Sin almacenamiento');
    });
  });
});
