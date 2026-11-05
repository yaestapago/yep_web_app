import { AssistantStreamReader } from './assistant-stream';

describe('AssistantStreamReader', () => {
  it('acepta eventos con y sin el prefijo data:', () => {
    const reader = new AssistantStreamReader();
    expect(
      reader.read(
        'data: {"t":"status","label":"Revisando…"}\n\n{"t":"status","label":"Mirando tu plan…"}\n',
      ),
    ).toEqual([
      { t: 'status', label: 'Revisando…' },
      { t: 'status', label: 'Mirando tu plan…' },
    ]);
  });

  it('lee solo lo nuevo de cada entrega y espera la línea completa', () => {
    const reader = new AssistantStreamReader();
    const first = 'data: {"t":"status","label":"Uno"}\n\ndata: {"t":"sta';
    expect(reader.read(first)).toEqual([{ t: 'status', label: 'Uno' }]);

    const second = `${first}tus","label":"Dos"}\n\n`;
    expect(reader.read(second)).toEqual([{ t: 'status', label: 'Dos' }]);
    expect(reader.read(second)).toEqual([]);
  });

  it('ignora pings, líneas dañadas y eventos desconocidos', () => {
    const reader = new AssistantStreamReader();
    expect(
      reader.read(': ping\n\nevent: x\n{no es json}\n{"t":"otro"}\n{"t":"status"}\n{"t":"done"}\n'),
    ).toEqual([]);
  });

  it('entrega la respuesta final con sus campos y el error del backend', () => {
    const reader = new AssistantStreamReader();
    expect(
      reader.read(
        '{"t":"done","conversationId":"c1","reply":"Listo","turn":2}\n{"t":"error","status":429,"message":"Vas muy rápido.","retryAfterSeconds":60}\n{"t":"error"}\n',
      ),
    ).toEqual([
      { t: 'done', conversationId: 'c1', reply: 'Listo', turn: 2 },
      { t: 'error', status: 429, message: 'Vas muy rápido.', retryAfterSeconds: 60 },
      { t: 'error', message: '' },
    ]);
  });

  it('al cerrar lee la última línea aunque no traiga salto', () => {
    const reader = new AssistantStreamReader();
    const body = '{"t":"done","conversationId":null,"reply":"Hola"}';
    expect(reader.read(body)).toEqual([]);
    expect(reader.finish(body)).toEqual([{ t: 'done', conversationId: null, reply: 'Hola' }]);
    expect(reader.finish(body)).toEqual([]);
  });
});
