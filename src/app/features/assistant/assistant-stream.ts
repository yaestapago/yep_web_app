import type { AssistantMessageResponse } from './services/assistant-api.service';

/**
 * Eventos de `POST /assistant/messages/stream`: una línea JSON por evento. Se aceptan con o
 * sin el prefijo `data:` de SSE, y se ignoran los comentarios `: ping` y lo que no se entienda.
 */
export type AssistantStreamEvent =
  | { t: 'status'; label: string }
  | ({ t: 'done' } & AssistantMessageResponse)
  | {
      t: 'error';
      message: string;
      status?: number;
      error?: string;
      retryAfterSeconds?: number;
    };

function parseLine(line: string): AssistantStreamEvent | null {
  const json = line.trim().replace(/^data:\s*/, '');
  if (!json.startsWith('{')) return null;

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (event['t'] === 'status') {
    return typeof event['label'] === 'string' ? { t: 'status', label: event['label'] } : null;
  }
  if (event['t'] === 'done') {
    return typeof event['reply'] === 'string' ? (event as unknown as AssistantStreamEvent) : null;
  }
  if (event['t'] === 'error') {
    const message = typeof event['message'] === 'string' ? event['message'] : '';
    return { ...event, t: 'error', message };
  }
  return null;
}

function parseLines(text: string): AssistantStreamEvent[] {
  return text
    .split(/\r?\n/)
    .map(parseLine)
    .filter((event): event is AssistantStreamEvent => event !== null);
}

/**
 * `partialText` trae todo lo recibido hasta ahora: este lector recuerda hasta dónde leyó y
 * solo entrega líneas completas (un evento puede llegar partido en dos paquetes).
 */
export class AssistantStreamReader {
  private offset = 0;

  read(accumulated: string): AssistantStreamEvent[] {
    const end = accumulated.lastIndexOf('\n') + 1;
    if (end <= this.offset) return [];
    const events = parseLines(accumulated.slice(this.offset, end));
    this.offset = end;
    return events;
  }

  /** Al cerrar la respuesta: la última línea puede venir sin salto. */
  finish(accumulated: string): AssistantStreamEvent[] {
    const events = parseLines(accumulated.slice(this.offset));
    this.offset = accumulated.length;
    return events;
  }
}
