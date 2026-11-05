/**
 * Una expresión regular que el navegador no entiende es un `SyntaxError` al analizar el archivo:
 * no falla la función, falla el chunk entero y la ruta no abre. El build no avisa, porque esbuild
 * no traduce las expresiones regulares y el mínimo por defecto de Angular 21 es Safari/iOS 16.4.
 *
 * El 6s, el 7 y el SE de primera generación se quedan en iOS 15.8 y siguen en uso: aquí no entra
 * lo que Safari anterior a 16.4 no soporta.
 */
interface SourceReader {
  list(directory: string): string[];
  read(file: string): string;
  root: string;
}

function sourceReader(): SourceReader {
  // Sin `import`: las pruebas se empaquetan como para el navegador y no resuelven `node:fs`.
  const { process } = globalThis as unknown as {
    process: {
      cwd(): string;
      getBuiltinModule(name: 'node:fs'): {
        readdirSync(path: string, options: { recursive: true }): string[];
        readFileSync(path: string, encoding: 'utf8'): string;
      };
    };
  };
  const fs = process.getBuiltinModule('node:fs');
  return {
    root: `${process.cwd()}/src/app`,
    list: (directory) => fs.readdirSync(directory, { recursive: true }),
    read: (file) => fs.readFileSync(file, 'utf8'),
  };
}

const UNSUPPORTED: readonly { name: string; pattern: RegExp }[] = [
  { name: 'lookbehind `(?<=` o `(?<!`', pattern: /\(\?<[=!]/ },
  { name: 'modificadores en línea `(?i:`', pattern: /\(\?-?[imsx]+(?:-[imsx]+)?:/ },
  { name: 'bandera `v` en un literal', pattern: /\/[gimsuy]*v[gimsuy]*(?=[\s;,.)]|$)/m },
  { name: 'bandera `v` o `d` en `new RegExp`', pattern: /RegExp\([^)]*,\s*['"`][gimsuy]*[dv]/ },
];

function unsupportedIn(source: string): string[] {
  return UNSUPPORTED.filter(({ pattern }) => pattern.test(source)).map(({ name }) => name);
}

describe('expresiones regulares compatibles con Safari anterior a 16.4', () => {
  it('ningún archivo de src/app usa sintaxis que rompa la carga en un iPhone viejo', () => {
    const { root, list, read } = sourceReader();
    // Las plantillas `.html` no entran: un `pattern` inválido no tumba el archivo.
    const files = list(root)
      .map((file) => file.replace(/\\/g, '/'))
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));
    expect(files.length).toBeGreaterThan(100);

    const found = files.flatMap((file) =>
      unsupportedIn(read(`${root}/${file}`)).map((name) => `${file}: ${name}`),
    );

    expect(found).toEqual([]);
  });

  it('la revisión de arriba de verdad detecta esa sintaxis', () => {
    expect(unsupportedIn(String.raw`const a = /(?<![*\w])\*/g;`)).toHaveLength(1);
    expect(unsupportedIn(String.raw`const a = /(?<=x)y/;`)).toHaveLength(1);
    expect(unsupportedIn('const a = /(?i:x)y/;')).toHaveLength(1);
    expect(unsupportedIn('const a = /[a--b]/v;')).toHaveLength(1);
    expect(unsupportedIn(`const a = new RegExp('x', 'gv');`)).toHaveLength(1);
    expect(unsupportedIn(`const a = new RegExp('x', 'dg');`)).toHaveLength(1);
  });

  it('no confunde lo que sí se puede usar', () => {
    expect(unsupportedIn(String.raw`const a = /(?<nombre>x)(?=y)(?!z)(?:w)/gu;`)).toEqual([]);
    expect(unsupportedIn(String.raw`const a = /\p{L}/u;`)).toEqual([]);
    expect(unsupportedIn(`const url = '/api/v1/pagos';`)).toEqual([]);
    expect(unsupportedIn(`const fecha = 'dd/MM/yyyy';`)).toEqual([]);
    expect(unsupportedIn('/** Motivo/id del soporte (s/min/h/d). */')).toEqual([]);
    expect(unsupportedIn('template: `<svg></svg>`')).toEqual([]);
  });
});
