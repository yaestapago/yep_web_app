import {
  assistantWhatsappUrl,
  buildAssistantSupportText,
  maskSupportQuestion,
} from './assistant-support';

/** Texto de la URL, ya decodificado. */
function textOf(url: string): string {
  return decodeURIComponent(url.split('text=')[1]);
}

describe('mensaje de WhatsApp a soporte', () => {
  it('lleva quién escribe, la pregunta, la pantalla y la referencia del caso', () => {
    expect(
      buildAssistantSupportText({
        name: 'Ana',
        business: 'Panadería Sol',
        question: '¿Por qué no llegó un pago?',
        page: 'Notificadores',
        conversationId: '507f1f77bcf86cd799439011',
      }),
    ).toBe(
      [
        'Hola, soy Ana, de Panadería Sol.',
        'Zaira no me pudo resolver esto: «¿Por qué no llegó un pago?».',
        'Estaba en Notificadores.',
        'Referencia del caso: 507f1f77bcf86cd799439011',
      ].join('\n'),
    );
  });

  it('sin datos no inventa nada', () => {
    expect(buildAssistantSupportText({})).toBe('Hola.\nNecesito ayuda con YEP.');
  });

  it('no deja pasar una cuenta escrita en la pregunta', () => {
    const text = buildAssistantSupportText({ question: 'Mi cuenta es 123 456 7890 12 y no llega' });
    expect(text).toContain('Mi cuenta es ••• y no llega');
    expect(text).not.toContain('7890');
  });

  it('recorta preguntas muy largas', () => {
    const text = buildAssistantSupportText({ question: 'a'.repeat(1000) });
    expect(text.length).toBeLessThan(400);
  });

  it('arma el enlace con el texto codificado', () => {
    expect(assistantWhatsappUrl('Hola, ¿sí?')).toBe(
      'https://wa.me/573108019222?text=Hola%2C%20%C2%BFs%C3%AD%3F',
    );
    expect(textOf(assistantWhatsappUrl('x'.repeat(5000)))).toHaveLength(1200);
  });

  describe('un emoji en el corte', () => {
    it('el corte del enlace no lo parte: sale sin él en vez de lanzar URIError', () => {
      expect(textOf(assistantWhatsappUrl(`${'a'.repeat(1199)}😀 y más`))).toBe(
        `${'a'.repeat(1199)}😀`,
      );
      expect(textOf(assistantWhatsappUrl(`${'a'.repeat(1200)}😀`))).toBe('a'.repeat(1200));
    });

    it('tolera el texto del backend que ya viene con un emoji partido', () => {
      const firstHalf = '😀'.slice(0, 1);
      const secondHalf = '😀'.slice(1);
      expect(textOf(assistantWhatsappUrl(`Resolver esto: «pago ${firstHalf}…».`))).toBe(
        'Resolver esto: «pago …».',
      );
      expect(textOf(assistantWhatsappUrl(`al revés ${secondHalf} fin`))).toBe('al revés  fin');
    });

    it('conserva los emojis completos', () => {
      expect(textOf(assistantWhatsappUrl('Listo 😀 gracias 🙏'))).toBe('Listo 😀 gracias 🙏');
    });

    it('el mensaje armado en la web tampoco lo parte', () => {
      const whole = buildAssistantSupportText({ question: `${'a'.repeat(299)}😀 y sigue` });
      expect(whole).toContain(`«${'a'.repeat(299)}😀».`);
      expect(() => encodeURIComponent(whole)).not.toThrow();

      const cut = buildAssistantSupportText({ question: `${'a'.repeat(300)}😀` });
      expect(cut).toContain(`«${'a'.repeat(300)}».`);
      expect(() => encodeURIComponent(cut)).not.toThrow();
    });
  });

  describe('lo que escribió la persona no viaja completo', () => {
    it('el caso del pulgar abajo: llave, correo, cuenta y monto', () => {
      const text = buildAssistantSupportText({
        question: 'mi llave @juanperez, correo juan@gmail.com, cuenta 123456789, pago de $ 48.000',
      });
      expect(text).toContain('mi llave @•••, correo •••, cuenta •••, pago de $ •••');
      for (const secret of ['juanperez', 'juan@', 'gmail', '123456789', '48.000', '48000']) {
        expect(text).not.toContain(secret);
      }
    });

    it.each([
      ['llave pegada a dos puntos', 'mi llave:@juan123 no llega', 'mi llave:@••• no llega'],
      ['llave entre paréntesis', '(@juanperez) no llega', '(@•••) no llega'],
      ['llave con tilde', 'la llave @josé.pérez falla', 'la llave @••• falla'],
      ['correo con tilde', 'correo josé@gmail.com', 'correo •••'],
      ['correo con subdominio', 'a.b+c@correo.empresa.co hoy', '••• hoy'],
      ['correo entre paréntesis', 'es (ana@yep.co).', 'es (•••).'],
      ['cuenta de cuatro cifras', 'termina en 4321', 'termina en •••'],
      ['monto con puntos', 'pagó 1.250.000 hoy', 'pagó ••• hoy'],
      ['celular con guiones', 'al 310-123-4567', 'al •••'],
      ['código largo', 'token abcd1234efgh5678ijkl', 'token •••'],
    ])('%s', (_name, question, masked) => {
      expect(maskSupportQuestion(question)).toBe(masked);
    });

    it('deja lo que no identifica a nadie', () => {
      expect(maskSupportQuestion('¿Por qué no llegó el pago de las 10:32 a @ la tienda 3?')).toBe(
        '¿Por qué no llegó el pago de las 10:32 a @ la tienda 3?',
      );
    });

    it('no rompe las comillas del mensaje ni deja saltos de línea', () => {
      expect(maskSupportQuestion('di «hola»\n\nya')).toBe('di "hola" ya');
    });
  });
});
