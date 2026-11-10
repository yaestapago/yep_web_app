import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import type { ReceiptIssuer, ReceiptTemplateSummary } from '../../../../shared/models/receipt-bank.models';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { BanksApiService } from '../../../banks/services/banks-api.service';
import { ReceiptBankApiService } from '../../services/receipt-bank-api.service';
import { ReceiptBankAdminPage } from './receipt-bank-admin.page';

const issuer = (overrides: Partial<ReceiptIssuer> = {}): ReceiptIssuer => ({
  id: 'i1',
  code: 'nequi',
  name: 'Nequi',
  bankCode: null,
  aliases: [],
  isActive: true,
  notes: null,
  templateCounts: { draft: 1, approved: 2, disabled: 0 },
  exampleCounts: { draft: 3, confirmed: 9 },
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

const summary: ReceiptTemplateSummary = {
  id: 't1',
  issuerId: 'i1',
  issuerCode: 'nequi',
  code: 'envio',
  name: 'Envío a otro Nequi',
  kind: 'same_bank_transfer',
  medium: 'app_screenshot',
  status: 'approved',
  approvedVersion: 2,
  hasUnapprovedChanges: true,
  exampleCounts: { draft: 1, confirmed: 3 },
  updatedAt: null,
};

describe('ReceiptBankAdminPage', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  function create(): ComponentFixture<ReceiptBankAdminPage> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ReceiptBankApiService, useValue: api },
        { provide: BanksApiService, useValue: { list: () => of({ banks: [] }) } },
        { provide: NotificationModalService, useValue: { confirm: vi.fn().mockResolvedValue(true) } },
      ],
    });
    const fixture = TestBed.createComponent(ReceiptBankAdminPage);
    fixture.detectChanges();
    return fixture;
  }

  const element = (fixture: ComponentFixture<ReceiptBankAdminPage>) => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    api = {
      listIssuers: vi.fn().mockReturnValue(of({ issuers: [issuer()] })),
      listTemplates: vi.fn().mockReturnValue(of({ templates: [summary] })),
      deactivateIssuer: vi.fn().mockReturnValue(of({ issuer: issuer({ isActive: false }) })),
      updateIssuer: vi.fn().mockReturnValue(of({ issuer: issuer({ isActive: true }) })),
      createIssuer: vi.fn(),
      createTemplate: vi.fn(),
      listExamples: vi.fn().mockReturnValue(of({ examples: [], nextCursor: null })),
      listCandidates: vi.fn().mockReturnValue(of({ candidates: [], nextCursor: null })),
    };
  });

  afterEach(() => TestBed.resetTestingModule());

  it('deja claro que el banco que importa es el emisor', () => {
    const fixture = create();
    const text = element(fixture).querySelector('[data-testid="issuer-explainer"]')?.textContent ?? '';
    expect(text).toContain('banco emisor');
    expect(text).toContain('desde el que el cliente hizo la transferencia');
    expect(text).toContain('no el banco donde la recibe el negocio');
  });

  it('lista emisores con sus conteos', () => {
    const fixture = create();
    const item = element(fixture).querySelector('[data-testid="issuer-item"]')?.textContent ?? '';
    expect(item).toContain('Nequi');
    expect(item).toContain('3 tipos · 12 ejemplos');
  });

  it('sin emisores invita a agregar el primero', () => {
    api['listIssuers'].mockReturnValue(of({ issuers: [] }));
    expect(element(create()).textContent).toContain('Aún no hay bancos emisores');
  });

  it('un error al cargar se puede reintentar', () => {
    api['listIssuers'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Falló' } })),
    );
    const fixture = create();
    expect(element(fixture).textContent).toContain('No pudimos cargar los emisores');
    fixture.componentInstance.loadIssuers();
    fixture.detectChanges();
    expect(element(fixture).querySelector('[data-testid="issuer-item"]')).not.toBeNull();
  });

  it('escoger un emisor muestra sus plantillas con estado', async () => {
    const fixture = create();
    await fixture.componentInstance.selectIssuer(issuer());
    fixture.detectChanges();
    expect(api['listTemplates']).toHaveBeenCalledWith('i1');
    const row = element(fixture).querySelector('[data-testid="template-row"]')?.textContent ?? '';
    expect(row).toContain('Envío a otro Nequi');
    expect(row).toContain('Transferencia al mismo banco');
    expect(row).toContain('Aprobada');
    expect(row).toContain('Cambios sin aprobar');
  });

  it('desactiva y activa un emisor sin borrarlo', async () => {
    const fixture = create();
    const page = fixture.componentInstance;
    await page.selectIssuer(issuer());
    page.setIssuerActive(issuer(), false);
    expect(api['deactivateIssuer']).toHaveBeenCalledWith('i1');
    expect(page.issuers()[0].isActive).toBe(false);
    fixture.detectChanges();
    expect(element(fixture).querySelector('[data-testid="activate-issuer"]')).not.toBeNull();

    page.setIssuerActive(page.issuers()[0], true);
    expect(api['updateIssuer']).toHaveBeenCalledWith('i1', { isActive: true });
    expect(page.issuers()[0].isActive).toBe(true);
  });

  it('un emisor inactivo no deja agregar tipos', async () => {
    api['listIssuers'].mockReturnValue(of({ issuers: [issuer({ isActive: false })] }));
    const fixture = create();
    await fixture.componentInstance.selectIssuer(issuer({ isActive: false }));
    fixture.detectChanges();
    expect(
      element(fixture).querySelector<HTMLButtonElement>('[data-testid="add-template"] button')?.disabled,
    ).toBe(true);
  });

  it('un código con espacios no se crea', async () => {
    const page = create().componentInstance;
    await page.selectIssuer(issuer());
    page.openNewTemplate();
    page.newName.set('Envío');
    page.newCode.set('con espacios');
    page.createTemplate();
    expect(page.newCodeError()).toBeTruthy();
    expect(api['createTemplate']).not.toHaveBeenCalled();
  });

  it('cada vista se carga solo al abrirla: los candidatos dejan bitácora', async () => {
    const fixture = create();
    expect(api['listCandidates']).not.toHaveBeenCalled();
    await fixture.componentInstance.setView('candidates');
    fixture.detectChanges();
    expect(api['listCandidates']).toHaveBeenCalledTimes(1);
    expect(element(fixture).querySelector('[data-testid="third-party-notice"]')).not.toBeNull();
  });

  it('escoger un comprobante abre su borrador y recuerda confirmarlo', () => {
    const page = create().componentInstance;
    page.onExampleChosen({ exampleId: 'e1', alreadySelected: false });
    expect(page.openExampleId()).toBe('e1');
    expect(page.notice()).toContain('nada entra solo');
  });
});
