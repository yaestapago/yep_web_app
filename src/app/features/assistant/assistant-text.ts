import { SUPPORT_WHATSAPP_URL } from '../../shared/constants/legal.constants';
import type { AssistantPageKey } from './assistant-page';

/**
 * Formato de las respuestas de Zaira: párrafos, listas, **negrita**, *cursiva*, `código` y
 * enlaces. Se arma como datos (no HTML) para pintarlo con plantillas, sin `innerHTML`.
 *
 * Solo son enlaces los dominios de la lista blanca: lo que escribe el modelo puede venir de
 * texto de terceros (nombres, motivos), y un enlace inyectado sería phishing.
 */

export interface AssistantInline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Montos, horas y direcciones (`--font-family-mono`). */
  mono?: boolean;
  /** Enlace externo, ya validado contra la lista blanca. */
  href?: string;
  /** Sección de la web: se vuelve enlace solo si esta persona puede entrar. */
  route?: AssistantPageKey;
  /** Dirección de correo: se muestra con botón de copiar. */
  copy?: boolean;
}

export type AssistantBlock =
  | { type: 'p'; parts: AssistantInline[] }
  | {
      type: 'ol' | 'ul';
      items: AssistantInline[][];
      /** Número del primer punto, si no es 1 (una lista cortada por una sublista). */
      start?: number;
      /** Sublista: se muestra con sangría debajo del punto anterior. */
      nested?: boolean;
    };

/** Nombres exactos del menú lateral. Fuera "Negocio" (grupo) y "Negocios" (ambiguo). */
const LABEL_TO_PAGE: Readonly<Record<string, AssistantPageKey>> = {
  Novedades: 'home',
  'Panel de control': 'dashboard',
  'Datos del negocio': 'business-data',
  'Cuentas bancarias': 'accounts',
  Notificadores: 'notifiers',
  Solicitudes: 'requests',
  Empleados: 'employees',
  Sedes: 'locations',
  Horarios: 'schedules',
  'Alertas WhatsApp': 'notification-routing',
  Informes: 'reports',
  Suscripción: 'subscription',
  'Cuentas de cobro': 'invoices',
  Configuración: 'settings',
  'Gestionar negocios': 'businesses',
};

const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'loom.com',
  'www.loom.com',
  'yaestapago.co',
  'www.yaestapago.co',
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
]);
const SUPPORT_LINK = new URL(SUPPORT_WHATSAPP_URL);
const SUPPORT_LINK_TEXT = 'WhatsApp de soporte';

const ORDERED_ITEM = /^(\d+)[.)]\s+(.*)$/;
const BULLET_ITEM = /^[-*•]\s+(.*)$/;
const INDENTED = /^(?:\s{2,}|\t)/;

/**
 * `**negrita**`, `` `código` ``, un enlace con título `[Con Gmail](https://…)` (así llegan los
 * videos de las guías), un enlace http(s) suelto sin la puntuación final, o `*cursiva*`.
 *
 * Lo que va antes de la cursiva se revisa en `inlineMatches`, no aquí con un lookbehind: Safari
 * anterior a 16.4 no lo entiende y el error no es de esta función, sino al cargar el archivo, y
 * tumba todas las pantallas que lo importan (`regex-support.spec.ts` lo vigila).
 */
const INLINE =
  /\*\*(.+?)\*\*|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?¿¡"'»])|\*([^\s*](?:[^*\n]*[^\s*])?)\*(?![*\w])/g;
/** Pegado a esto, un asterisco no abre cursiva: `2*3*4`, `***`. */
const BEFORE_LITERAL_ASTERISK = /[*\w]/;

/** Dentro del texto corrido: nombre de sección entre comillas, correo, soporte, monto y hora. */
const PLAIN = new RegExp(
  [
    `["“](${Object.keys(LABEL_TO_PAGE).join('|')})["”]`,
    String.raw`([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})`,
    String.raw`(\+?57[\s-]?310[\s-]?801[\s-]?9222|\b310[\s-]?801[\s-]?9222\b)`,
    String.raw`(\bwa\.me\/573108019222\b)`,
    String.raw`(\$\s?\d(?:[\d.,]*\d)?)`,
    String.raw`(\b\d{1,2}:\d{2}(?:\s?[apAP]\.?\s?[mM]\b\.?)?)`,
  ].join('|'),
  'g',
);

/** La URL si se puede abrir desde el chat; `null` si no está en la lista blanca. */
export function allowedAssistantHref(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;

  const host = parsed.hostname.toLowerCase();
  // WhatsApp solo el de soporte: otro número en el chat sería suplantar a YEP.
  if (host === SUPPORT_LINK.hostname) {
    return parsed.pathname === SUPPORT_LINK.pathname ? url : null;
  }
  return ALLOWED_HOSTS.has(host) || host.endsWith('.yaestapago.co') ? url : null;
}

function parsePlain(text: string): AssistantInline[] {
  const parts: AssistantInline[] = [];
  let last = 0;
  for (const match of text.matchAll(PLAIN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index) });
    if (match[1] !== undefined) {
      parts.push({ text: match[1], route: LABEL_TO_PAGE[match[1]] });
    } else if (match[2] !== undefined) {
      parts.push({ text: match[2], mono: true, copy: true });
    } else if (match[3] !== undefined) {
      parts.push({ text: match[3], href: SUPPORT_WHATSAPP_URL });
    } else if (match[4] !== undefined) {
      parts.push({ text: SUPPORT_LINK_TEXT, href: SUPPORT_WHATSAPP_URL });
    } else {
      parts.push({ text: match[5] ?? match[6], mono: true });
    }
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** Como `matchAll(INLINE)`, descartando la cursiva que no puede empezar donde cayó. */
function* inlineMatches(text: string): Generator<RegExpExecArray> {
  // Copia: `parseAssistantInline` se llama a sí misma y `lastIndex` es de cada expresión.
  const pattern = new RegExp(INLINE);
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const before = match.index > 0 ? text[match.index - 1] : '';
    if (match[6] !== undefined && BEFORE_LITERAL_ASTERISK.test(before)) {
      // Se sigue desde el carácter siguiente, no desde el final: ahí puede empezar otra marca.
      pattern.lastIndex = match.index + 1;
      continue;
    }
    yield match;
  }
}

export function parseAssistantInline(text: string): AssistantInline[] {
  const parts: AssistantInline[] = [];
  // Texto corrido pendiente: un enlace rechazado se queda aquí, pegado a lo que lo rodea.
  let plain = '';
  const flushPlain = () => {
    if (plain) parts.push(...parsePlain(plain));
    plain = '';
  };

  let last = 0;
  for (const match of inlineMatches(text)) {
    const index = match.index;
    plain += text.slice(last, index);
    last = index + match[0].length;

    if (match[3] !== undefined) {
      // Con título: si el destino no está permitido queda el título, sin la URL.
      const href = allowedAssistantHref(match[4]);
      if (!href) {
        plain += match[3];
        continue;
      }
      flushPlain();
      parts.push({ text: match[3], href });
    } else if (match[5] !== undefined) {
      const href = allowedAssistantHref(match[5]);
      if (!href) {
        plain += match[5];
        continue;
      }
      flushPlain();
      const isSupport = new URL(href).hostname === SUPPORT_LINK.hostname;
      parts.push({ text: isSupport ? SUPPORT_LINK_TEXT : href, href });
    } else {
      flushPlain();
      if (match[1] !== undefined) {
        parts.push(...parseAssistantInline(match[1]).map((part) => ({ ...part, bold: true })));
      } else if (match[2] !== undefined) {
        parts.push(...parseAssistantInline(match[2]).map((part) => ({ ...part, mono: true })));
      } else {
        parts.push(...parseAssistantInline(match[6]).map((part) => ({ ...part, italic: true })));
      }
    }
  }
  plain += text.slice(last);
  flushPlain();
  return parts;
}

export function parseAssistantText(text: string): AssistantBlock[] {
  const blocks: AssistantBlock[] = [];
  let paragraph: string[] = [];
  // `as`: las funciones de abajo la reasignan y TS no lo ve si la deja en `null`.
  let list = null as {
    type: 'ol' | 'ul';
    items: string[];
    start?: number;
    nested?: boolean;
  } | null;
  // Línea en blanco tras una lista: la lista sigue si el próximo punto es del mismo tipo.
  let blankAfterList = false;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'p', parts: parseAssistantInline(paragraph.join('\n')) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const { items, ...rest } = list;
      blocks.push({ ...rest, items: items.map(parseAssistantInline) });
      list = null;
    }
    blankAfterList = false;
  };

  for (const raw of text.split(/\r?\n/)) {
    // Sin títulos: si llega un "## ...", se deja como texto normal.
    const line = raw.trim().replace(/^#{1,6}\s+/, '');
    if (!line) {
      flushParagraph();
      blankAfterList = list !== null;
      continue;
    }
    const ordered = ORDERED_ITEM.exec(line);
    const bullet = ordered ? null : BULLET_ITEM.exec(line);
    if (ordered || bullet) {
      flushParagraph();
      const type = ordered ? 'ol' : 'ul';
      const nested = type === 'ul' && list !== null && INDENTED.test(raw);
      if (list?.type !== type || Boolean(list.nested) !== nested) {
        flushList();
        const number = ordered ? Number(ordered[1]) : 1;
        list = {
          type,
          items: [],
          ...(number !== 1 ? { start: number } : {}),
          ...(nested ? { nested } : {}),
        };
      }
      list.items.push(ordered ? ordered[2] : bullet![1]);
      blankAfterList = false;
      continue;
    }
    if (list && !blankAfterList) {
      // Línea pegada a un punto de la lista: es la continuación de ese punto.
      list.items[list.items.length - 1] += ` ${line}`;
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Texto tal cual (lo que escribió el usuario): sin formato, enlaces ni botones. */
export function plainAssistantBlocks(text: string): AssistantBlock[] {
  return [{ type: 'p', parts: [{ text }] }];
}
