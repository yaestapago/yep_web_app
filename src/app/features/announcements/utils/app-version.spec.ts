import { compareAppVersions, isValidVersionInput, parseAppVersion } from './app-version';

describe('app-version (comparación del contrato de anuncios)', () => {
  it('compara por segmentos numéricos: 1.0.10 > 1.0.9', () => {
    expect(compareAppVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareAppVersions('1.0.9', '1.0.10')).toBe(-1);
    expect(compareAppVersions('1.2.0', '1.2')).toBe(0);
  });

  it('descarta desde el primer carácter que no es dígito ni punto', () => {
    expect(parseAppVersion('1.1.0-stage')).toEqual([1, 1, 0]);
    expect(parseAppVersion('1.0.9+14')).toEqual([1, 0, 9]);
    expect(compareAppVersions('1.0.9+14', '1.0.9')).toBe(0);
  });

  it('lo ilegible es desconocido', () => {
    expect(parseAppVersion('')).toBeNull();
    expect(parseAppVersion(null)).toBeNull();
    expect(parseAppVersion('v1.0')).toBeNull();
    expect(parseAppVersion('1..0')).toBeNull();
    expect(compareAppVersions('abc', '1.0.0')).toBeNull();
  });

  it('el panel solo acepta números con puntos al escribir', () => {
    expect(isValidVersionInput('1.0.10')).toBe(true);
    expect(isValidVersionInput(' 2.0 ')).toBe(true);
    expect(isValidVersionInput('1.0.10-stage')).toBe(false);
    expect(isValidVersionInput('1.')).toBe(false);
  });
});
