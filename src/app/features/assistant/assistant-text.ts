/**
 * Formato mínimo de las respuestas de Zaira: párrafos, listas numeradas o con
 * viñetas, **negrita** y enlaces https. Se arma como datos (no HTML) para
 * pintarlo con plantillas, sin `innerHTML`.
 */

export interface AssistantInline {
  text: string;
  bold?: boolean;
  href?: string;
}

export type AssistantBlock =
  | { type: 'p'; parts: AssistantInline[] }
  | { type: 'ol' | 'ul'; items: AssistantInline[][] };

const ORDERED_ITEM = /^\d+[.)]\s+(.*)$/;
const BULLET_ITEM = /^[-*•]\s+(.*)$/;
/** `**negrita**` o un enlace http(s) sin la puntuación final. */
const INLINE = /\*\*(.+?)\*\*|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?¿¡"'»])/g;

export function parseAssistantInline(text: string): AssistantInline[] {
  const parts: AssistantInline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index) });
    if (match[1] !== undefined) {
      parts.push({ text: match[1], bold: true });
    } else {
      parts.push({ text: match[2], href: match[2] });
    }
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function parseAssistantText(text: string): AssistantBlock[] {
  const blocks: AssistantBlock[] = [];
  let paragraph: string[] = [];
  // `as`: las funciones de abajo la reasignan y TS no lo ve si la deja en `null`.
  let list = null as { type: 'ol' | 'ul'; items: string[] } | null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'p', parts: parseAssistantInline(paragraph.join('\n')) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: list.type, items: list.items.map(parseAssistantInline) });
      list = null;
    }
  };

  for (const raw of text.split(/\r?\n/)) {
    // Sin títulos: si llega un "## ...", se deja como texto normal.
    const line = raw.trim().replace(/^#{1,6}\s+/, '');
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const ordered = ORDERED_ITEM.exec(line);
    const bullet = ordered ? null : BULLET_ITEM.exec(line);
    if (ordered || bullet) {
      flushParagraph();
      const type = ordered ? 'ol' : 'ul';
      if (list?.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((ordered ?? bullet)![1]);
      continue;
    }
    if (list) {
      // Línea pegada a un punto de la lista: es la continuación de ese punto.
      list.items[list.items.length - 1] += ` ${line}`;
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}
