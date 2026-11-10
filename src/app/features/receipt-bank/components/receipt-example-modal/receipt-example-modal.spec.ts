import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import type {
  ReceiptClassifyResult,
  ReceiptExample,
  ReceiptTemplate,
} from '../../../../shared/models/receipt-bank.models';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { ReceiptBankApiService } from '../../services/receipt-bank-api.service';
import { ReceiptExampleModal } from './receipt-example-modal';

const example = (overrides: Partial<ReceiptExample> = {}): ReceiptExample => ({
  id: 'e1',
  label: null,
  status: 'draft',
  expectMatch: true,
  issuerId: 'i1',
  templateId: 't1',
  sourceType: 'superadmin_upload',
  mimeType: 'image/png',
  selectedAt: '2026-11-05T12:00:00.000Z',
  confirmedAt: null,
  ocr: { text: 'Texto de prueba', mode: 'fast', extractedAt: '2026-11-05T12:00:00.000Z' },
  expected: null,
  absentFields: [],
  aiSuggestion: null,
  source: { type: 'superadmin_upload', paymentSupportId: null, accountId: null },
  selectedBy: { userId: 'u1', name: 'Nombre de prueba' },
  confirmedBy: null,
  events: [],
  ...overrides,
});

const template: ReceiptTemplate = {
  id: 't1',
  issuerId: 'i1',
  issuerCode: 'nequi',
  code: 'envio',
  name: 'Envío',
  kind: 'same_bank_transfer',
  medium: 'app_screenshot',
  status: 'draft',
  draft: {
    fields: [
      { key: 'reference', required: false, labels: ['Referencia'], valueFormat: 'reference' },
      { key: 'amount', required: true, labels: ['¿Cuánto?'], valueFormat: 'money' },
      { key: 'dateTime', required: false, labels: ['Fecha'], valueFormat: 'datetime' },
    ],
  },
  approved: null,
  hasUnapprovedChanges: false,
  history: [],
  createdAt: null,
  updatedAt: null,
};

const proposal: ReceiptClassifyResult = {
  exampleId: 'e1',
  isReceipt: true,
  confidence: 0.8,
  issuer: { existingIssuerId: 'i2', code: 'daviplata', name: 'Daviplata', confidence: 0.9 },
  template: {
    existingTemplateId: null,
    suggestedCode: 'envio_daviplata',
    suggestedName: 'Envío de Daviplata',
    kind: 'same_bank_transfer',
    medium: 'app_screenshot',
    confidence: 0.7,
  },
  fields: [{ key: 'amount', required: true, labels: ['Valor'], valueFormat: 'money' }],
  detection: { allOf: ['envio'] },
};

const confirmError = (body: object) =>
  throwError(() => new HttpErrorResponse({ status: 400, error: body }));

describe('ReceiptExampleModal', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let confirmDialog: ReturnType<typeof vi.fn>;

  function create(current: ReceiptExample = example()): ComponentFixture<ReceiptExampleModal> {
    api['getExample'].mockReturnValue(of({ example: current }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ReceiptBankApiService, useValue: api },
        { provide: NotificationModalService, useValue: { confirm: confirmDialog } },
      ],
    });
    const fixture = TestBed.createComponent(ReceiptExampleModal);
    fixture.componentRef.setInput('exampleId', current.id);
    fixture.detectChanges();
    return fixture;
  }

  const fieldBox = (fixture: ComponentFixture<ReceiptExampleModal>, key: string): HTMLElement =>
    (fixture.nativeElement as HTMLElement).querySelector(`[data-field="${key}"]`) as HTMLElement;

  beforeEach(() => {
    confirmDialog = vi.fn().mockResolvedValue(true);
    api = {
      getExample: vi.fn(),
      exampleFileUrl: vi.fn().mockReturnValue(of({ url: 'https://archivo.test/e1', expiresIn: 300 })),
      listTemplates: vi.fn().mockReturnValue(of({ templates: [] })),
      getTemplate: vi.fn().mockReturnValue(of({ template })),
      updateExample: vi.fn((_id: string, patch: object) =>
        of({ example: example({ ...(patch as Partial<ReceiptExample>) }) }),
      ),
      confirmExample: vi.fn().mockReturnValue(
        of({
          example: example({
            status: 'confirmed',
            confirmedAt: '2026-11-05T13:00:00.000Z',
            confirmedBy: { userId: 'u1', name: 'Nombre de prueba' },
          }),
        }),
      ),
      deleteExample: vi.fn().mockReturnValue(of(undefined)),
      classifyExample: vi.fn().mockReturnValue(of({ jobId: 'j1' })),
      waitForJob: vi.fn().mockReturnValue(of(proposal)),
      createIssuer: vi.fn(),
      createTemplate: vi.fn(),
    };
  });

  afterEach(() => TestBed.resetTestingModule());

  it('muestra primero los datos requeridos', () => {
    const modal = create().componentInstance;
    expect(modal.fields().map((field) => field.key)).toEqual(['amount', 'reference', 'dateTime']);
  });

  it('guarda "$ 48.000" como 48000 y la fecha en hora de Bogotá', () => {
    const modal = create().componentInstance;
    modal.setValue('amount', '$ 48.000');
    modal.setValue('dateTime', '05/07/2026 3:45 pm');
    modal.save();

    const [id, patch] = api['updateExample'].mock.calls[0];
    expect(id).toBe('e1');
    expect(patch.expected).toEqual({ amount: 48000, dateTime: '2026-07-05T15:45' });
  });

  it('un monto ambiguo se marca junto a su campo, sin borrar lo escrito ni llamar al servidor', () => {
    const fixture = create();
    const modal = fixture.componentInstance;
    modal.setValue('amount', '48.00');
    modal.save();
    fixture.detectChanges();

    expect(api['updateExample']).not.toHaveBeenCalled();
    expect(modal.value('amount')).toBe('48.00');
    expect(fieldBox(fixture, 'amount').textContent).toContain('$ 48.000');
  });

  describe('confirmar', () => {
    it('queda deshabilitado con motivo mientras falte un requerido', () => {
      const fixture = create();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('[data-testid="confirm-reason"]')?.textContent).toContain(
        'Falta: Monto',
      );
      expect(
        element.querySelector<HTMLButtonElement>('[data-testid="confirm-example"] button')?.disabled,
      ).toBe(true);

      fixture.componentInstance.setValue('amount', '$ 48.000');
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="confirm-reason"]')).toBeNull();
    });

    it('sin plantilla el motivo lo pide', () => {
      const modal = create(example({ issuerId: null, templateId: null })).componentInstance;
      expect(modal.confirmBlockReason()).toBe('Escoge el banco emisor.');
      modal.issuerId.set('i1');
      expect(modal.confirmBlockReason()).toBe('Escoge el tipo de comprobante.');
    });

    it('un negativo pide un nombre y no valores', () => {
      const modal = create().componentInstance;
      modal.expectMatch.set(false);
      expect(modal.fields()).toEqual([]);
      expect(modal.confirmBlockReason()).toContain('nombre');
      modal.label.set('Otro banco');
      expect(modal.confirmBlockReason()).toBe('');
    });

    it('guarda lo escrito y luego confirma', () => {
      const fixture = create();
      const modal = fixture.componentInstance;
      const changed = vi.fn();
      modal.changed.subscribe(changed);
      modal.setValue('amount', '$ 48.000');
      modal.confirm();

      expect(api['updateExample'].mock.invocationCallOrder[0]).toBeLessThan(
        api['confirmExample'].mock.invocationCallOrder[0],
      );
      expect(modal.isConfirmed()).toBe(true);
      expect(changed).toHaveBeenCalled();
    });

    it('muestra missingFields, requiredAbsent y contradictory junto a su campo', () => {
      api['confirmExample'].mockReturnValue(
        confirmError({
          message: 'Faltan datos para confirmar este ejemplo.',
          missingFields: ['amount'],
          requiredAbsent: ['reference'],
          contradictory: ['dateTime'],
        }),
      );
      const fixture = create(example({ expected: { amount: 48000 } }));
      fixture.componentInstance.confirm();
      fixture.detectChanges();

      expect(fieldBox(fixture, 'amount').textContent).toContain('Falta este dato');
      expect(fieldBox(fixture, 'reference').textContent).toContain('requerido');
      expect(fieldBox(fixture, 'dateTime').textContent).toContain('Deja solo uno');
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-testid="example-error"]')?.textContent,
      ).toContain('Faltan datos');
    });

    it('un rechazo no borra lo escrito', () => {
      api['updateExample'].mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'No válido' } })),
      );
      const modal = create().componentInstance;
      modal.setValue('amount', '$ 48.000');
      modal.setValue('reference', 'M0000001');
      modal.confirm();

      expect(modal.value('amount')).toBe('$ 48.000');
      expect(modal.value('reference')).toBe('M0000001');
      expect(modal.error()).toBe('No válido');
      expect(api['confirmExample']).not.toHaveBeenCalled();
    });

    it('un dato con error de un campo que no está a la vista se nombra arriba', () => {
      api['confirmExample'].mockReturnValue(
        confirmError({ message: 'Faltan datos.', missingFields: ['llave'] }),
      );
      const modal = create(example({ expected: { amount: 48000 } })).componentInstance;
      modal.confirm();
      expect(modal.error()).toContain('Llave');
    });

    it('escribir en el campo quita su error', () => {
      api['confirmExample'].mockReturnValue(
        confirmError({ message: 'Faltan datos.', missingFields: ['reference'] }),
      );
      const modal = create(example({ expected: { amount: 48000 } })).componentInstance;
      modal.confirm();
      expect(modal.fieldErrors().reference).toBeTruthy();
      modal.setValue('reference', 'M1');
      expect(modal.fieldErrors().reference).toBeUndefined();
    });
  });

  it('"no lo muestra" quita el valor y va en absentFields', () => {
    const modal = create().componentInstance;
    modal.setValue('reference', 'M1');
    modal.setAbsent('reference', true);
    modal.setValue('amount', '$ 48.000');
    modal.save();

    const [, patch] = api['updateExample'].mock.calls[0];
    expect(patch.absentFields).toEqual(['reference']);
    expect(patch.expected).toEqual({ amount: 48000 });
  });

  describe('la propuesta de la IA', () => {
    it('no toca el formulario sin un clic', () => {
      const fixture = create();
      const modal = fixture.componentInstance;
      modal.setValue('amount', '$ 48.000');
      modal.classify();
      fixture.detectChanges();

      expect(api['waitForJob']).toHaveBeenCalledWith('j1');
      expect(modal.proposal()).toEqual(proposal);
      expect(modal.issuerId()).toBe('i1');
      expect(modal.templateId()).toBe('t1');
      expect(modal.value('amount')).toBe('$ 48.000');
      expect(api['updateExample']).not.toHaveBeenCalled();
      expect(api['createIssuer']).not.toHaveBeenCalled();
      expect(api['createTemplate']).not.toHaveBeenCalled();
    });

    it('"Usar" aplica el emisor existente sin crear ni guardar', () => {
      const modal = create().componentInstance;
      modal.classify();
      modal.useProposedIssuer();
      expect(modal.issuerId()).toBe('i2');
      expect(modal.templateId()).toBe('');
      expect(api['createIssuer']).not.toHaveBeenCalled();
      expect(api['updateExample']).not.toHaveBeenCalled();
    });

    it('crea la plantilla en borrador solo al pedirlo', () => {
      api['createTemplate'].mockReturnValue(of({ template: { ...template, id: 't9' } }));
      const modal = create().componentInstance;
      const catalogChanged = vi.fn();
      modal.catalogChanged.subscribe(catalogChanged);
      modal.classify();
      modal.useProposedTemplate();

      const [issuerId, request] = api['createTemplate'].mock.calls[0];
      expect(issuerId).toBe('i1');
      expect(request.code).toBe('envio_daviplata');
      expect(modal.templateId()).toBe('t9');
      expect(catalogChanged).toHaveBeenCalled();
    });

    it('sin llave de IA dice qué pasa', () => {
      api['classifyExample'].mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 503, error: { message: 'x' } })),
      );
      const modal = create().componentInstance;
      modal.classify();
      expect(modal.classifyError()).toContain('no está configurada');
      expect(modal.classifying()).toBe(false);
    });

    it('muestra el error del trabajo', () => {
      api['waitForJob'].mockReturnValue(throwError(() => new Error('Revisa los labels.')));
      const modal = create().componentInstance;
      modal.classify();
      expect(modal.classifyError()).toBe('Revisa los labels.');
    });
  });

  describe('cerrar', () => {
    it('pide confirmar si hay cambios sin guardar', async () => {
      confirmDialog.mockResolvedValue(false);
      const modal = create().componentInstance;
      const closed = vi.fn();
      modal.closed.subscribe(closed);
      modal.setValue('amount', '$ 48.000');
      await modal.close();
      expect(confirmDialog).toHaveBeenCalledTimes(1);
      expect(closed).not.toHaveBeenCalled();
    });

    it('sin cambios cierra de una', async () => {
      const modal = create().componentInstance;
      const closed = vi.fn();
      modal.closed.subscribe(closed);
      await modal.close();
      expect(confirmDialog).not.toHaveBeenCalled();
      expect(closed).toHaveBeenCalledTimes(1);
    });
  });

  it('borrar pide confirmar', async () => {
    confirmDialog.mockResolvedValue(false);
    const modal = create().componentInstance;
    await modal.remove();
    expect(api['deleteExample']).not.toHaveBeenCalled();
  });

  it('un PDF se abre con un enlace, no en un img', () => {
    const fixture = create(example({ mimeType: 'application/pdf' }));
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="receipt-image"]')).toBeNull();
    const link = element.querySelector<HTMLAnchorElement>('[data-testid="receipt-open-link"]');
    expect(link?.href).toBe('https://archivo.test/e1');
    expect(link?.rel).toContain('noopener');
  });

  it('un comprobante de cliente recuerda que trae datos de terceros', () => {
    const fixture = create(example({ sourceType: 'client_support' }));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('datos personales de terceros');
  });

  it('no escribe nada en localStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const modal = create().componentInstance;
    modal.setValue('amount', '$ 48.000');
    modal.save();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
