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

  it('no convierte en enlace lo que no es http(s)', () => {
    expect(parseAssistantInline('javascript:alert(1)')).toEqual([
      { text: 'javascript:alert(1)' },
    ]);
  });
});
