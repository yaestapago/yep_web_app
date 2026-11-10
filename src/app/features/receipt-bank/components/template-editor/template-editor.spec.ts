import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import type {
  ReceiptRulesResult,
  ReceiptTemplate,
  ReceiptTestResult,
} from '../../../../shared/models/receipt-bank.models';
import { NotificationModalService } from '../../../../shared/ui/notification-modal/notification-modal.service';
import { CopilotJobError, ReceiptBankApiService } from '../../services/receipt-bank-api.service';
import { TemplateEditor } from './template-editor';

const template = (overrides: Partial<ReceiptTemplate> = {}): ReceiptTemplate => ({
  id: 't1',
  issuerId: 'i1',
  issuerCode: 'nequi',
  code: 'envio',
  name: 'Envío',
  kind: 'same_bank_transfer',
  medium: 'app_screenshot',
  status: 'draft',
  draft: {
    fields: [{ key: 'amount', required: true, labels: ['¿Cuánto?'], valueFormat: 'money' }],
    detection: { allOf: ['envio', 'cuanto'], anyOf: [], noneOf: [], minAnyOf: 0 },
    rules: { amount: [{ pattern: 'Cuanto\\s*([\\d.]+)' }] },
  },
  approved: null,
  hasUnapprovedChanges: false,
  history: [],
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

const testResult = (overrides: Partial<ReceiptTestResult> = {}): ReceiptTestResult => ({
  allPass: false,
  canApprove: false,
  blockers: ['examples_failing'],
  positives: { passed: 1, total: 2 },
  negatives: { passed: 0, total: 0 },
  collisions: [],
  results: [],
  ...overrides,
});

const proposal: ReceiptRulesResult = {
  templateId: 't1',
  mode: 'generate',
  proposed: {
    rules: { amount: [{ pattern: 'Valor\\s*([\\d.]+)' }] },
    detection: { allOf: ['envio realizado', 'valor'], anyOf: [], noneOf: [], minAnyOf: 0 },
  },
  results: [{ exampleId: 'abc123456', expectMatch: true, ok: true, failedFields: [], reason: null }],
  collisionCount: 0,
  blockers: ['too_few_examples'],
  allPass: true,
  iterations: 2,
  costUsd: 0.04,
};

const conflict = (body: object) =>
  throwError(() => new HttpErrorResponse({ status: 409, error: body }));

describe('TemplateEditor', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let confirmDialog: ReturnType<typeof vi.fn>;

  function create(current: ReceiptTemplate = template()): ComponentFixture<TemplateEditor> {
    api['getTemplate'].mockReturnValue(of({ template: current }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ReceiptBankApiService, useValue: api },
        { provide: NotificationModalService, useValue: { confirm: confirmDialog } },
      ],
    });
    const fixture = TestBed.createComponent(TemplateEditor);
    fixture.componentRef.setInput('templateId', current.id);
    fixture.detectChanges();
    return fixture;
  }

  const element = (fixture: ComponentFixture<TemplateEditor>) => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    confirmDialog = vi.fn().mockResolvedValue(true);
    api = {
      getTemplate: vi.fn(),
      updateTemplate: vi.fn((_id: string, patch: Partial<ReceiptTemplate>) =>
        of({ template: template({ ...patch }) }),
      ),
      testTemplate: vi.fn().mockReturnValue(of(testResult())),
      approveTemplate: vi.fn().mockReturnValue(of({ template: template({ status: 'approved' }) })),
      disableTemplate: vi.fn().mockReturnValue(of({ template: template({ status: 'disabled' }) })),
      enableTemplate: vi.fn().mockReturnValue(of({ template: template({ status: 'approved' }) })),
      deleteTemplate: vi.fn().mockReturnValue(of(undefined)),
      suggestRules: vi.fn().mockReturnValue(of({ jobId: 'j1' })),
      repairRules: vi.fn().mockReturnValue(of({ jobId: 'j2' })),
      waitForJob: vi.fn().mockReturnValue(of(proposal)),
      listExamples: vi.fn().mockReturnValue(of({ examples: [], nextCursor: null })),
    };
  });

  afterEach(() => TestBed.resetTestingModule());

  it('carga sin cambios pendientes', () => {
    const editor = create().componentInstance;
    expect(editor.dirty()).toBe(false);
    expect(editor.fields()[0].labels).toBe('¿Cuánto?');
  });

  describe('estados', () => {
    it.each([
      ['draft', false, ['Borrador']],
      ['approved', false, ['Aprobada']],
      ['approved', true, ['Aprobada', 'Cambios sin aprobar']],
      ['disabled', false, ['Desactivada']],
    ] as const)('%s, cambios=%s', (status, hasUnapprovedChanges, labels) => {
      const editor = create(template({ status, hasUnapprovedChanges })).componentInstance;
      expect(editor.statusChips().map((chip) => chip.label)).toEqual(labels);
    });
  });

  describe('editar', () => {
    it('guarda labels como lista y las reglas como objeto', async () => {
      const editor = create().componentInstance;
      editor.updateField(0, { labels: '¿Cuánto?\nValor' });
      editor.rulesText.set('{"amount":[{"pattern":"x"}]}');
      await editor.save();

      const [id, patch] = api['updateTemplate'].mock.calls[0];
      expect(id).toBe('t1');
      expect(patch.draft.fields[0].labels).toEqual(['¿Cuánto?', 'Valor']);
      expect(patch.draft.rules).toEqual({ amount: [{ pattern: 'x' }] });
    });

    it('un JSON roto no se guarda ni se prueba', async () => {
      const fixture = create();
      const editor = fixture.componentInstance;
      editor.rulesText.set('{ roto');
      fixture.detectChanges();
      await editor.save();
      editor.runTest();

      expect(editor.rulesError()).toContain('JSON');
      expect(api['updateTemplate']).not.toHaveBeenCalled();
      expect(api['testTemplate']).not.toHaveBeenCalled();
    });

    it('un dato repetido se avisa', () => {
      const editor = create().componentInstance;
      editor.addField();
      editor.setFieldKey(1, 'amount');
      expect(editor.duplicateFieldError()).toBeTruthy();
    });

    it('avisa antes de devolver a borrador una plantilla aprobada', async () => {
      confirmDialog.mockResolvedValue(false);
      const editor = create(template({ status: 'approved' })).componentInstance;
      editor.allOf.set('otra cosa\nmas');
      await editor.save();
      expect(confirmDialog).toHaveBeenCalledTimes(1);
      expect(api['updateTemplate']).not.toHaveBeenCalled();
    });

    it('cambiar solo el nombre no avisa: no la devuelve a borrador', async () => {
      const editor = create(template({ status: 'approved' })).componentInstance;
      editor.name.set('Otro nombre');
      await editor.save();
      expect(confirmDialog).not.toHaveBeenCalled();
      expect(api['updateTemplate']).toHaveBeenCalledTimes(1);
    });

    it('avisa cuando la detección queda con menos de 2 señales', () => {
      const editor = create().componentInstance;
      expect(editor.weakDetection()).toBe(false);
      editor.allOf.set('solo uno');
      expect(editor.weakDetection()).toBe(true);
      editor.anyOf.set('a\nb');
      editor.minAnyOf.set('1');
      expect(editor.weakDetection()).toBe(false);
    });

    it('avisa de los datos del flujo que no están como requeridos', () => {
      const editor = create().componentInstance;
      expect(editor.optionalFlowFields()).toEqual(['Cuenta de destino', 'Referencia', 'Fecha y hora']);
    });
  });

  describe('probar', () => {
    it('prueba lo que hay en el editor, sin guardar', () => {
      const fixture = create();
      const editor = fixture.componentInstance;
      editor.allOf.set('nuevo\ntexto');
      editor.runTest();
      fixture.detectChanges();

      const [id, definition] = api['testTemplate'].mock.calls[0];
      expect(id).toBe('t1');
      expect(definition.detection.allOf).toEqual(['nuevo', 'texto']);
      expect(api['updateTemplate']).not.toHaveBeenCalled();
      expect(editor.dirty()).toBe(true);
      expect(element(fixture).querySelector('[data-testid="test-results"]')).not.toBeNull();
    });

    it('muestra los blockers de la prueba en palabras', () => {
      api['testTemplate'].mockReturnValue(of(testResult({ blockers: ['collisions', 're2_unavailable'] })));
      const fixture = create();
      fixture.componentInstance.runTest();
      fixture.detectChanges();
      const text = element(fixture).querySelector('[data-testid="test-blockers"]')?.textContent ?? '';
      expect(text).toContain('otra plantilla aprobada');
      expect(text).toContain('RE2');
      expect(text).not.toContain('re2_unavailable');
    });
  });

  describe('aprobar', () => {
    it('queda deshabilitado con motivo si hay cambios sin guardar', () => {
      const fixture = create();
      const editor = fixture.componentInstance;
      editor.name.set('Otro');
      fixture.detectChanges();

      expect(element(fixture).querySelector('[data-testid="approve-reason"]')?.textContent).toContain(
        'Guarda los cambios',
      );
      expect(
        element(fixture).querySelector<HTMLButtonElement>('[data-testid="approve-template"] button')?.disabled,
      ).toBe(true);
      editor.approve();
      expect(api['approveTemplate']).not.toHaveBeenCalled();
    });

    it('queda deshabilitado si la última prueba no lo permite', () => {
      const editor = create().componentInstance;
      editor.runTest();
      expect(editor.approveBlockReason()).toContain('última prueba');
      editor.approve();
      expect(api['approveTemplate']).not.toHaveBeenCalled();
    });

    it('una prueba que lo permite no lo bloquea', () => {
      api['testTemplate'].mockReturnValue(of(testResult({ canApprove: true, allPass: true, blockers: [] })));
      const editor = create().componentInstance;
      editor.runTest();
      expect(editor.approveBlockReason()).toBe('');
    });

    it('aprueba y actualiza la plantilla', () => {
      const editor = create().componentInstance;
      const changed = vi.fn();
      editor.changed.subscribe(changed);
      editor.approve();
      expect(editor.template()?.status).toBe('approved');
      expect(editor.notice()).toContain('aprobada');
      expect(changed).toHaveBeenCalled();
    });

    it('el 409 muestra cada blocker con texto claro, también collisions y re2_unavailable', () => {
      api['approveTemplate'].mockReturnValue(
        conflict({
          message: 'Esta plantilla todavía no se puede aprobar.',
          blockers: [
            'invalid_rules',
            'weak_detection',
            'no_required_fields',
            'too_few_examples',
            'examples_failing',
            'collisions',
            're2_unavailable',
          ],
        }),
      );
      const fixture = create();
      fixture.componentInstance.approve();
      fixture.detectChanges();

      const box = element(fixture).querySelector('[data-testid="approval-blockers"]');
      const items = [...(box?.querySelectorAll('[data-testid="approval-blocker"]') ?? [])].map(
        (item) => item.textContent ?? '',
      );
      expect(box?.textContent).toContain('todavía no se puede aprobar');
      expect(items).toHaveLength(7);
      expect(items.join(' ')).toContain('otra plantilla aprobada');
      expect(items.join(' ')).toContain('motor RE2');
      expect(items.join(' ')).not.toContain('re2_unavailable');
      expect(items.join(' ')).not.toContain('collisions');
    });

    it('el 409 pinta el resultado sin valores y las colisiones', () => {
      api['approveTemplate'].mockReturnValue(
        conflict({
          message: 'Esta plantilla todavía no se puede aprobar.',
          blockers: ['collisions'],
          result: testResult({
            collisions: [
              {
                exampleId: 'e9',
                templateId: 't9',
                templateName: 'Pago por QR',
                templateStatus: 'approved',
                direction: 'this_detects_other',
                blocking: true,
              },
            ],
            results: [
              {
                exampleId: 'e1',
                label: 'Con valores ocultos',
                expectMatch: true,
                ok: false,
                fields: [{ key: 'amount', status: 'mismatch', ok: false, expected: null, got: null }],
              },
            ],
          }),
        }),
      );
      const fixture = create();
      fixture.componentInstance.approve();
      fixture.detectChanges();

      const text = element(fixture).textContent ?? '';
      expect(text).toContain('también reconoce un comprobante de Pago por QR');
      expect(text).toContain('❌ No coincide');
      expect(text).not.toContain('Esperado');
    });

    it('un 409 sin blockers (cambió a la vez) muestra su mensaje', () => {
      api['approveTemplate'].mockReturnValue(conflict({ message: 'La plantilla cambió. Revísala de nuevo.' }));
      const editor = create().componentInstance;
      editor.approve();
      expect(editor.approvalMessage()).toContain('cambió');
      expect(editor.approvalBlockers()).toEqual([]);
    });

    it('activar una desactivada usa el mismo manejo del 409', () => {
      api['enableTemplate'].mockReturnValue(conflict({ message: 'No pasa.', blockers: ['examples_failing'] }));
      const editor = create(template({ status: 'disabled' })).componentInstance;
      editor.enable();
      expect(editor.approvalBlockerMessages()[0]).toContain('❌');
    });

    it('una aprobada sin cambios no ofrece aprobar otra vez, pero sí desactivar', () => {
      const fixture = create(template({ status: 'approved' }));
      expect(element(fixture).querySelector('[data-testid="approve-template"]')).toBeNull();
      expect(element(fixture).querySelector('[data-testid="disable-template"]')).not.toBeNull();
    });
  });

  describe('la IA propone; un admin decide', () => {
    it('generar sondea el trabajo y no guarda ni cambia el editor', () => {
      const editor = create().componentInstance;
      const rulesBefore = editor.rulesText();
      editor.generateRules();

      expect(api['suggestRules']).toHaveBeenCalledWith('t1');
      expect(api['waitForJob']).toHaveBeenCalledWith('j1');
      expect(editor.proposal()).toEqual(proposal);
      expect(editor.rulesText()).toBe(rulesBefore);
      expect(editor.dirty()).toBe(false);
      expect(api['updateTemplate']).not.toHaveBeenCalled();
      expect(editor.copilotRunning()).toBeNull();
    });

    it('"Cargar en el editor" llena el formulario y sigue sin guardar', () => {
      const editor = create().componentInstance;
      editor.generateRules();
      editor.loadProposal();

      expect(JSON.parse(editor.rulesText())).toEqual(proposal.proposed.rules);
      expect(editor.allOf()).toBe('envio realizado\nvalor');
      expect(editor.dirty()).toBe(true);
      expect(api['updateTemplate']).not.toHaveBeenCalled();
      expect(editor.notice()).toContain('sin guardar');
    });

    it('en una aprobada avisa que guardarla la devuelve a borrador', () => {
      const editor = create(template({ status: 'approved' })).componentInstance;
      editor.generateRules();
      editor.loadProposal();
      expect(editor.notice()).toContain('vuelve a borrador');
    });

    it('reparar pide guardar primero: repara lo guardado', () => {
      const editor = create().componentInstance;
      editor.name.set('Otro');
      editor.repairRules();
      expect(editor.repairBlockReason()).toContain('Guarda primero');
      expect(api['repairRules']).not.toHaveBeenCalled();
    });

    it('reparar usa su ruta', () => {
      const editor = create().componentInstance;
      editor.repairRules();
      expect(api['repairRules']).toHaveBeenCalledWith('t1');
      expect(api['waitForJob']).toHaveBeenCalledWith('j2');
    });

    it('sin llave (503) lo dice y no sondea', () => {
      api['suggestRules'].mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 503, error: { message: 'x' } })),
      );
      const editor = create().componentInstance;
      editor.generateRules();
      expect(editor.copilotError()).toContain('no está configurada');
      expect(api['waitForJob']).not.toHaveBeenCalled();
    });

    it('muestra el errorMessage del trabajo, y el aviso al vencer el límite', () => {
      api['waitForJob'].mockReturnValue(
        throwError(() => new CopilotJobError('No pudimos terminar. Inténtalo de nuevo.')),
      );
      const editor = create().componentInstance;
      editor.generateRules();
      expect(editor.copilotError()).toBe('No pudimos terminar. Inténtalo de nuevo.');
      expect(editor.copilotRunning()).toBeNull();
    });

    it('el 409 de "nada falla" muestra su mensaje', () => {
      api['repairRules'].mockReturnValue(conflict({ message: 'Ningún ejemplo está fallando.' }));
      const editor = create().componentInstance;
      editor.repairRules();
      expect(editor.copilotError()).toBe('Ningún ejemplo está fallando.');
    });
  });

  it('volver pide confirmar si hay cambios', async () => {
    confirmDialog.mockResolvedValue(false);
    const editor = create().componentInstance;
    const back = vi.fn();
    editor.back.subscribe(back);
    editor.name.set('Otro');
    await editor.goBack();
    expect(back).not.toHaveBeenCalled();
  });

  it('funciona con una plantilla nueva, sin definición', () => {
    const fixture = create(template({ draft: {} }));
    const editor = fixture.componentInstance;
    expect(editor.fields()).toEqual([]);
    expect(editor.dirty()).toBe(false);
    editor.addField();
    expect(editor.fields()[0].key).toBe('amount');
    expect(editor.fields()[0].valueFormat).toBe('money');
    fixture.detectChanges();
    expect(element(fixture).querySelector('[data-testid="template-field"]')).not.toBeNull();
  });
});
