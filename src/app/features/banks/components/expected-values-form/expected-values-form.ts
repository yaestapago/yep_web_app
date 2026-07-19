import { Component, input, model } from '@angular/core';

import { Toggle } from '../../../../shared/ui/toggle/toggle';
import type {
  ExpectedResolution,
  ExpectedValues,
} from '../../../../shared/models/bank.models';

/**
 * Sub-formulario del ground truth de un ejemplo: valores esperados de la
 * extracción, toggle de ejemplo negativo y resolución de cuenta esperada
 * (cuentas simuladas + resultado). No llama a la API: el estado vive en
 * `model()` signals que el padre (modal de ejemplo) persiste.
 */
@Component({
  selector: 'app-expected-values-form',
  imports: [Toggle],
  templateUrl: './expected-values-form.html',
  styleUrl: './expected-values-form.scss',
})
export class ExpectedValuesForm {
  readonly expected = model<ExpectedValues | null>(null);
  /** `false` = ejemplo negativo (NO debería parsearse). */
  readonly expectMatch = model(true);
  /** Cuentas del notificador simuladas, una por línea. */
  readonly simulatedAccounts = model('');
  readonly expectedResolution = model<ExpectedResolution | ''>('');
  readonly expectedResolvedAccount = model('');
  /** Llave Bre-B detectada por el parser (para el botón "usar detectada"). */
  readonly detectedLlave = input<string | null>(null);

  /**
   * Edita a mano un campo del ground truth. Vacío = quita el campo (no se
   * verifica). `amount` se limpia a número; el resto es texto. Deja `null` si no
   * queda ningún campo, para no guardar un `expected` vacío.
   */
  setExpectedField(key: keyof ExpectedValues, raw: string): void {
    const current: Record<string, unknown> = { ...(this.expected() ?? {}) };
    const value = (raw ?? '').trim();
    if (key === 'amount') {
      const n = Number.parseFloat(value.replace(/[^\d.]/g, ''));
      if (value !== '' && Number.isFinite(n)) current['amount'] = n;
      else delete current['amount'];
    } else if (value === '') {
      delete current[key];
    } else {
      current[key] = value;
    }
    this.expected.set(
      Object.keys(current).length ? (current as ExpectedValues) : null,
    );
  }

  onResolutionChange(value: string): void {
    this.expectedResolution.set(value as ExpectedResolution | '');
  }
}
