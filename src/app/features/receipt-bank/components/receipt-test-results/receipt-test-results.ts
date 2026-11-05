import { Component, computed, input } from '@angular/core';

import type {
  ReceiptTestCollision,
  ReceiptTestField,
  ReceiptTestResult,
} from '../../../../shared/models/receipt-bank.models';
import { Alert } from '../../../../shared/ui/alert/alert';
import { StatusChip } from '../../../../shared/ui/status-chip/status-chip';
import { Table } from '../../../../shared/ui/table/table';
import { FIELD_LABELS, FIELD_TEST_LABELS, formatFieldValue } from '../../utils/receipt-bank.util';

/**
 * Resultado de probar una plantilla: ✅/❌ por ejemplo y por campo, con ícono y palabra. Sirve para
 * `/test` y para el `result` del 409 de aprobar, que no trae valores: ahí no se pintan esas columnas.
 */
@Component({
  selector: 'app-receipt-test-results',
  imports: [Alert, StatusChip, Table],
  templateUrl: './receipt-test-results.html',
  styleUrl: './receipt-test-results.scss',
})
export class ReceiptTestResults {
  readonly result = input.required<ReceiptTestResult>();
  /** Muestra solo el resumen del ejemplo indicado (modal de ejemplo). */
  readonly onlyExampleId = input<string | null>(null);

  readonly results = computed(() => {
    const only = this.onlyExampleId();
    const results = this.result().results;
    return only ? results.filter((item) => item.exampleId === only) : results;
  });

  readonly collisions = computed(() => (this.onlyExampleId() ? [] : this.result().collisions));

  /** En el 409 de aprobar `expected` y `got` siempre llegan en `null`. */
  readonly hasValues = computed(() =>
    this.results().some((item) =>
      (item.fields ?? []).some((field) => field.expected !== null || field.got !== null),
    ),
  );

  fieldLabel(field: ReceiptTestField): string {
    return FIELD_LABELS[field.key] ?? field.key;
  }

  statusLabel(field: ReceiptTestField): string {
    return FIELD_TEST_LABELS[field.status] ?? (field.ok ? '✅ Coincide' : '❌ Falla');
  }

  value(field: ReceiptTestField, which: 'expected' | 'got'): string {
    return formatFieldValue(field.key, field[which]);
  }

  collisionText(collision: ReceiptTestCollision): string {
    const name = collision.templateName ?? 'otra plantilla';
    const text =
      collision.direction === 'this_detects_other'
        ? `Esta plantilla también reconoce un comprobante de ${name}.`
        : `${name} también reconoce un comprobante de esta plantilla.`;
    return collision.blocking ? `${text} Esto impide aprobar.` : `${text} Es un aviso: no impide aprobar.`;
  }
}
