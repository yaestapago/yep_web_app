import { allowedAssistantHref, parseAssistantInline, parseAssistantText } from './assistant-text';

describe('parseAssistantText (formato de las respuestas de Zaira)', () => {
  it('separa párrafos por línea en blanco y conserva los saltos simples', () => {
    expect(parseAssistantText('Hola.\nSoy Zaira.\n\n¿En qué te ayudo?')).toEqual([
      { type: 'p', parts: [{ text: 'Hola.\nSoy Zaira.' }] },
      { type: 'p', parts: [{ text: '¿En qué te ayudo?' }] },
    ]);
  });

  it('arma listas numeradas y con viñetas, y pega las continuaciones al punto', () => {
    const blocks = parseAssistantText(
      'Pasos:\n1. Abre tu correo.\n2. Toca "Nuevo notificador"\ny elige "Teléfono".\n\n- Uno\n- Dos',
    );
    expect(blocks).toEqual([
      { type: 'p', parts: [{ text: 'Pasos:' }] },
      {
        type: 'ol',
        items: [
          [{ text: 'Abre tu correo.' }],
          [{ text: 'Toca "Nuevo notificador" y elige "Teléfono".' }],
        ],
      },
      { type: 'ul', items: [[{ text: 'Uno' }], [{ text: 'Dos' }]] },
    ]);
  });

  it('quita los títulos de markdown y deja el texto', () => {
    expect(parseAssistantText('## Precios')).toEqual([{ type: 'p', parts: [{ text: 'Precios' }] }]);
  });

  it('una lista separada por líneas en blanco sigue siendo una sola', () => {
    expect(parseAssistantText('1. Uno\n\n2. Dos\n\n3. Tres')).toEqual([
      { type: 'ol', items: [[{ text: 'Uno' }], [{ text: 'Dos' }], [{ text: 'Tres' }]] },
    ]);
  });

  it('una sublista no reinicia la numeración de los pasos', () => {
    expect(parseAssistantText('1. Uno\n   - detalle\n2. Dos')).toEqual([
      { type: 'ol', items: [[{ text: 'Uno' }]] },
      { type: 'ul', nested: true, items: [[{ text: 'detalle' }]] },
      { type: 'ol', start: 2, items: [[{ text: 'Dos' }]] },
    ]);
  });

  it('un párrafo entre dos listas conserva el número donde iba', () => {
    expect(parseAssistantText('1. Uno\n\nMira esto.\n\n2. Dos')).toEqual([
      { type: 'ol', items: [[{ text: 'Uno' }]] },
      { type: 'p', parts: [{ text: 'Mira esto.' }] },
      { type: 'ol', start: 2, items: [[{ text: 'Dos' }]] },
    ]);
  });
});

describe('parseAssistantInline', () => {
  it('reconoce negrita y el WhatsApp de soporte sin la puntuación final', () => {
    expect(parseAssistantInline('**No.** Escríbenos a https://wa.me/573108019222.')).toEqual([
      { text: 'No.', bold: true },
      { text: ' Escríbenos a ' },
      { text: 'WhatsApp de soporte', href: 'https://wa.me/573108019222' },
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
    expect(
      parseAssistantText(
        'Videos:\n- [Con Gmail](https://www.loom.com/share/1)\n- [Con Outlook](https://loom.com/share/2)',
      ),
    ).toEqual([
      { type: 'p', parts: [{ text: 'Videos:' }] },
      {
        type: 'ul',
        items: [
          [{ text: 'Con Gmail', href: 'https://www.loom.com/share/1' }],
          [{ text: 'Con Outlook', href: 'https://loom.com/share/2' }],
        ],
      },
    ]);
  });

  it('conserva la marca de tiempo de un video', () => {
    expect(
      parseAssistantInline('[Crear el filtro](https://www.loom.com/share/abc?t=135s)'),
    ).toEqual([{ text: 'Crear el filtro', href: 'https://www.loom.com/share/abc?t=135s' }]);
  });

  it('un enlace con título que no es https queda como texto', () => {
    expect(parseAssistantInline('[clic](javascript:alert(1))')).toEqual([
      { text: '[clic](javascript:alert(1))' },
    ]);
  });

  it('no convierte en enlace lo que no es http(s)', () => {
    expect(parseAssistantInline('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }]);
  });

  it('negrita con enlace adentro', () => {
    expect(parseAssistantInline('**[Con Gmail](https://www.loom.com/share/abc)**')).toEqual([
      { text: 'Con Gmail', href: 'https://www.loom.com/share/abc', bold: true },
    ]);
  });

  it('cursiva y código sin mostrar los símbolos', () => {
    expect(parseAssistantInline('Mira *esto* y `aquello`')).toEqual([
      { text: 'Mira ' },
      { text: 'esto', italic: true },
      { text: ' y ' },
      { text: 'aquello', mono: true },
    ]);
    expect(parseAssistantInline('2 * 3 * 4')).toEqual([{ text: '2 * 3 * 4' }]);
  });
});

describe('lista blanca de enlaces', () => {
  it('un enlace inyectado queda como texto, sin URL clicable', () => {
    expect(parseAssistantInline('Paga aquí: https://yep-pagos.evil.co/x ya')).toEqual([
      { text: 'Paga aquí: https://yep-pagos.evil.co/x ya' },
    ]);
    expect(parseAssistantInline('[Tu banco](https://evil.co/banco)')).toEqual([
      { text: 'Tu banco' },
    ]);
  });

  it.each([
    ['https://wa.me/573108019222?text=hola', true],
    ['https://www.loom.com/share/abc', true],
    ['https://yaestapago.co/blog', true],
    ['https://app.yaestapago.co', true],
    ['https://youtu.be/abc', true],
    ['http://yaestapago.co', false],
    ['https://wa.me/573000000000', false],
    ['https://yaestapago.co.evil.com', false],
    ['https://evilyaestapago.co', false],
    ['https://loom.com@evil.com', false],
    ['no es url', false],
  ])('%s → %s', (url, allowed) => {
    expect(allowedAssistantHref(url) !== null).toBe(allowed);
  });

  it('el número de soporte es enlace; otro número no', () => {
    expect(parseAssistantInline('WhatsApp: +57 310 801 9222.')).toEqual([
      { text: 'WhatsApp: ' },
      { text: '+57 310 801 9222', href: 'https://wa.me/573108019222' },
      { text: '.' },
    ]);
    expect(parseAssistantInline('Llama al +57 300 000 0000')).toEqual([
      { text: 'Llama al +57 300 000 0000' },
    ]);
  });
});

describe('secciones, correos, montos y horas', () => {
  it('un nombre exacto del menú entre comillas lleva a su pantalla y pierde las comillas', () => {
    expect(parseAssistantInline('Ve a "Notificadores".')).toEqual([
      { text: 'Ve a ' },
      { text: 'Notificadores', route: 'notifiers' },
      { text: '.' },
    ]);
    expect(parseAssistantInline('Abre “Alertas WhatsApp”')).toEqual([
      { text: 'Abre ' },
      { text: 'Alertas WhatsApp', route: 'notification-routing' },
    ]);
  });

  it('lo demás entre comillas sigue siendo texto', () => {
    expect(parseAssistantInline('"Negocio" → "Nuevo notificador"')).toEqual([
      { text: '"Negocio" → "Nuevo notificador"' },
    ]);
  });

  it('la dirección de correo se puede copiar', () => {
    expect(parseAssistantInline('Reenvía a yep.reenvio+abc@gmail.com.')).toEqual([
      { text: 'Reenvía a ' },
      { text: 'yep.reenvio+abc@gmail.com', mono: true, copy: true },
      { text: '.' },
    ]);
    expect(parseAssistantInline('`yep.reenvio+abc@gmail.com`')).toEqual([
      { text: 'yep.reenvio+abc@gmail.com', mono: true, copy: true },
    ]);
  });

  it('montos y horas van en mono', () => {
    expect(parseAssistantInline('Llegó **$ 48.000** a las 10:32 a. m. y $2.000.')).toEqual([
      { text: 'Llegó ' },
      { text: '$ 48.000', mono: true, bold: true },
      { text: ' a las ' },
      { text: '10:32 a. m.', mono: true },
      { text: ' y ' },
      { text: '$2.000', mono: true },
      { text: '.' },
    ]);
  });
});

describe('cursiva sin lookbehind (Safari anterior a 16.4 no lo entiende)', () => {
  it('reconoce la cursiva al inicio, tras un espacio y tras un signo', () => {
    expect(parseAssistantInline('*uno* y *dos* (*tres*)')).toEqual([
      { text: 'uno', italic: true },
      { text: ' y ' },
      { text: 'dos', italic: true },
      { text: ' (' },
      { text: 'tres', italic: true },
      { text: ')' },
    ]);
  });

  it('reconoce la cursiva pegada a lo que acaba de terminar', () => {
    expect(parseAssistantInline('`a`*b*')).toEqual([
      { text: 'a', mono: true },
      { text: 'b', italic: true },
    ]);
  });

  it('no toma por cursiva lo pegado a una letra, un número o un asterisco', () => {
    expect(parseAssistantInline('2*3*4')).toEqual([{ text: '2*3*4' }]);
    expect(parseAssistantInline('a*b* c')).toEqual([{ text: 'a*b* c' }]);
    expect(parseAssistantInline('***')).toEqual([{ text: '***' }]);
  });

  it('un asterisco descartado no se come la cursiva que viene después', () => {
    expect(parseAssistantInline('a*b* *c*')).toEqual([
      { text: 'a*b* ' },
      { text: 'c', italic: true },
    ]);
  });

  it('el análisis recursivo no pierde la posición del texto de afuera', () => {
    expect(parseAssistantInline('**x *y* z** y *w*')).toEqual([
      { text: 'x ', bold: true },
      { text: 'y', italic: true, bold: true },
      { text: ' z', bold: true },
      { text: ' y ' },
      { text: 'w', italic: true },
    ]);
  });
});
