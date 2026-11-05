import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { ReceiptTestResult } from '../../../../shared/models/receipt-bank.models';
import { ReceiptTestResults } from './receipt-test-results';

const result: ReceiptTestResult = {
  allPass: false,
  canApprove: false,
  blockers: ['examples_failing', 'collisions'],
  positives: { passed: 1, total: 2 },
  negatives: { passed: 1, total: 1 },
  collisions: [
    {
      exampleId: 'e9',
      templateId: 't9',
      templateName: 'Pago por QR',
      templateStatus: 'approved',
      direction: 'this_detects_other',
      blocking: true,
    },
    {
      exampleId: 'e8',
      templateId: 't8',
      templateName: 'Bre-B',
      templateStatus: 'draft',
      direction: 'other_detects_this',
      blocking: false,
    },
  ],
  results: [
    {
      exampleId: 'e1',
      label: 'Con referencia',
      expectMatch: true,
      ok: false,
      fields: [
        { key: 'amount', status: 'mismatch', ok: false, expected: 48000, got: 1250300 },
        { key: 'reference', status: 'ok', ok: true, expected: 'M0000001', got: 'M0000001' },
      ],
      diagnosis: { reason: 'value_mismatch', message: 'Un dato no coincide con el valor esperado.' },
    },
    { exampleId: 'e2', label: null, expectMatch: false, ok: true, fields: [], diagnosis: null },
  ],
};

describe('ReceiptTestResults', () => {
  function create(input: ReceiptTestResult, only: string | null = null): ComponentFixture<ReceiptTestResults> {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(ReceiptTestResults);
    fixture.componentRef.setInput('result', input);
    fixture.componentRef.setInput('onlyExampleId', only);
    fixture.detectChanges();
    return fixture;
  }

  it('da ✅/❌ con palabra por ejemplo y por campo, y los montos como $ 48.000', () => {
    const element = create(result).nativeElement as HTMLElement;
    const examples = element.querySelectorAll('[data-testid="test-example"]');
    expect(examples).toHaveLength(2);
    expect(examples[0].textContent).toContain('❌ Falla');
    expect(examples[1].textContent).toContain('✅ Pasa');
    expect(examples[1].textContent).toContain('No debe leerse');

    const rows = element.querySelectorAll('[data-testid="test-field"]');
    expect(rows[0].textContent).toContain('Monto');
    expect(rows[0].textContent).toContain('$ 48.000');
    expect(rows[0].textContent).toContain('❌ No coincide');
    expect(rows[1].textContent).toContain('✅ Coincide');
    expect(examples[0].textContent).toContain('Un dato no coincide');
  });

  it('explica las colisiones y cuál impide aprobar', () => {
    const element = create(result).nativeElement as HTMLElement;
    const collisions = element.querySelectorAll('[data-testid="collision"]');
    expect(collisions[0].textContent).toContain('también reconoce un comprobante de Pago por QR');
    expect(collisions[0].textContent).toContain('impide aprobar');
    expect(collisions[1].textContent).toContain('Bre-B también reconoce un comprobante de esta plantilla');
    expect(collisions[1].textContent).toContain('no impide aprobar');
  });

  it('sin valores (409 de aprobar) no pinta esas columnas', () => {
    const withoutValues: ReceiptTestResult = {
      ...result,
      results: [
        {
          exampleId: 'e1',
          label: 'Sin valores',
          expectMatch: true,
          ok: false,
          fields: [{ key: 'amount', status: 'mismatch', ok: false, expected: null, got: null }],
        },
      ],
    };
    const text = (create(withoutValues).nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Esperado');
    expect(text).toContain('❌ No coincide');
  });

  it('puede mostrar solo un ejemplo', () => {
    const element = create(result, 'e2').nativeElement as HTMLElement;
    expect(element.querySelectorAll('[data-testid="test-example"]')).toHaveLength(1);
    expect(element.querySelector('[data-testid="collision"]')).toBeNull();
  });

  it('dice si el ejemplo no entró en la prueba', () => {
    const text = (create(result, 'otro').nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('no entró en la prueba');
  });
});
