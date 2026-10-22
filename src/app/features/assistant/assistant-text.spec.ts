import { parseAssistantInline, parseAssistantText } from './assistant-text';

describe('parseAssistantText (formato de las respuestas de Zaira)', () => {
  it('separa párrafos por línea en blanco y conserva los saltos simples', () => {
    expect(parseAssistantText('Hola.\nSoy Zaira.\n\n¿En qué te ayudo?')).toEqual([
      { type: 'p', parts: [{ text: 'Hola.\nSoy Zaira.' }] },
      { type: 'p', parts: [{ text: '¿En qué te ayudo?' }] },
    ]);
  });

  it('arma listas numeradas y con viñetas, y pega las continuaciones al punto', () => {
    const blocks = parseAssistantText(
      'Pasos:\n1. Ve a "Notificadores".\n2. Toca "Nuevo notificador"\ny elige "Teléfono".\n\n- Uno\n- Dos',
    );
    expect(blocks).toEqual([
      { type: 'p', parts: [{ text: 'Pasos:' }] },
      {
        type: 'ol',
        items: [
          [{ text: 'Ve a "Notificadores".' }],
          [{ text: 'Toca "Nuevo notificador" y elige "Teléfono".' }],
        ],
      },
      { type: 'ul', items: [[{ text: 'Uno' }], [{ text: 'Dos' }]] },
    ]);
  });

  it('quita los títulos de markdown y deja el texto', () => {
    expect(parseAssistantText('## Precios')).toEqual([
      { type: 'p', parts: [{ text: 'Precios' }] },
    ]);
  });
});

describe('parseAssistantInline', () => {
  it('reconoce negrita y enlaces https sin la puntuación final', () => {
    expect(
      parseAssistantInline('**No.** Escríbenos a https://wa.me/573108019222.'),
    ).toEqual([
      { text: 'No.', bold: true },
      { text: ' Escríbenos a ' },
      { text: 'https://wa.me/573108019222', href: 'https://wa.me/573108019222' },
      { text: '.' },
    ]);
  });

  it('muestra los enlaces con título (videos de las guías) por su título', () => {
    expect(
      parseAssistantInline('Mira el video: [Con Gmail](https://www.loom.com/share/abc).'),
    ).toEqual([
      { text: 'Mira el video: ' },
      { text: 'Con Gmail', href: 'https://www.loom.com/share/abc' },
      { text: '.' },
    ]);
    expect(parseAssistantText('Videos:\n- [Con Gmail](https://a.co/1)\n- [Con Outlook](https://a.co/2)')).toEqual([
      { type: 'p', parts: [{ text: 'Videos:' }] },
      {
        type: 'ul',
        items: [
          [{ text: 'Con Gmail', href: 'https://a.co/1' }],
          [{ text: 'Con Outlook', href: 'https://a.co/2' }],
        ],
      },
    ]);
  });

  it('un enlace con título que no es https queda como texto', () => {
    expect(parseAssistantInline('[clic](javascript:alert(1))')).toEqual([
      { text: '[clic](javascript:alert(1))' },
    ]);
  });

  it('no convierte en enlace lo que no es http(s)', () => {
    expect(parseAssistantInline('javascript:alert(1)')).toEqual([
      { text: 'javascript:alert(1)' },
    ]);
  });
});
