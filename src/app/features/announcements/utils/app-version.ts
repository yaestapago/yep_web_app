/**
 * Comparación de versiones del contrato de anuncios: semver numérico por segmentos
 * (`1.0.10 > 1.0.9`). Antes de comparar se descarta todo desde el primer carácter que no
 * sea dígito ni punto (`1.1.0-stage` → `1.1.0`, `1.0.9+14` → `1.0.9`). Lo que no se puede
 * leer es "desconocido" (`null`).
 */
export function parseAppVersion(value: string | null | undefined): number[] | null {
  if (typeof value !== 'string') return null;
  const match = /^[0-9.]*/.exec(value.trim());
  const cleaned = match ? match[0] : '';
  if (!cleaned) return null;
  const parts = cleaned.split('.');
  if (parts.some((part) => part === '')) return null;
  return parts.map((part) => Number(part));
}

/** `-1` si a < b, `0` si son iguales, `1` si a > b; `null` si alguna es desconocida. */
export function compareAppVersions(
  a: string | null | undefined,
  b: string | null | undefined,
): -1 | 0 | 1 | null {
  const left = parseAppVersion(a);
  const right = parseAppVersion(b);
  if (!left || !right) return null;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const x = left[index] ?? 0;
    const y = right[index] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Lo que el panel acepta al escribir una versión: solo números separados por puntos
 * (`1.0.10`). Es más estricto que la lectura para no guardar "1.0.10-stage" a mano.
 * Igual a `VERSION_INPUT_REGEX` del backend.
 */
export const APP_VERSION_INPUT_PATTERN = /^\d{1,9}(\.\d{1,9}){0,3}$/;

export function isValidVersionInput(value: string): boolean {
  return APP_VERSION_INPUT_PATTERN.test(value.trim());
}
