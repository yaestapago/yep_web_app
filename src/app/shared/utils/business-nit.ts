/** Misma normalización que el backend (`accounts/business-nit.ts`): sin espacios ni puntos. */
export function normalizeBusinessNit(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s.]/g, '');
}

/**
 * Mensaje de error del campo NIT, o '' si es válido. El NIT es opcional salvo
 * que las cuentas de cobro vayan a salir a nombre del negocio.
 */
export function businessNitError(value: string | null | undefined, billToBusiness: boolean): string {
  const nit = normalizeBusinessNit(value);
  if (!nit) {
    return billToBusiness
      ? 'Para emitir las cuentas de cobro a nombre del negocio primero ingresa su NIT'
      : '';
  }
  return /^\d{5,15}(-\d)?$/.test(nit) ? '' : 'Solo números y, opcional, el dígito de verificación (900123456-7)';
}
