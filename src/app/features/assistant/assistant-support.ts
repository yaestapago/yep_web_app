import { SUPPORT_WHATSAPP_URL } from '../../shared/constants/legal.constants';

/** Las URL muy largas fallan en algunos navegadores: el texto se recorta antes de codificarlo. */
const SUPPORT_TEXT_MAX_LENGTH = 1200;
const QUESTION_MAX_LENGTH = 300;
const MASK = '•••';

/** Con la bandera `u` un emoji completo es un solo carácter: esto solo encuentra mitades sueltas. */
const LONE_SURROGATE = /[\uD800-\uDFFF]/gu;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*/gu;
/** Llave Bre-B. Se captura lo de antes y no se usa lookbehind: ver `regex-support.spec.ts`. */
const PAYMENT_KEY = /(^|[^\p{L}\p{N}])@[\p{L}\p{N}._-]{3,}/gu;
/** Código o token: largo y con algún número. */
const LONG_TOKEN = /\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,}\b/g;
/** Separadores entre cifras: "310 123-45" es un solo número. */
const DIGIT_SEPARATOR = /(\d)[\s.-]+(?=\d)/g;
/** Cuenta, cédula, celular, clave o monto. */
const NUMBER = /\d{4,}/g;

export interface AssistantSupportContext {
  name?: string | null;
  business?: string | null;
  question?: string | null;
  page?: string | null;
  conversationId?: string | null;
}

/** Recorta por caracteres, no por unidades de `String`: así no parte un emoji por la mitad. */
function cutText(text: string, max: number): string {
  return Array.from(text).slice(0, max).join('');
}

/**
 * Línea de WhatsApp de YEP con el mensaje ya escrito. Se calcula al pintar el `<a>`: si se
 * esperara una llamada al API, el navegador podría bloquear la ventana. Un emoji partido haría
 * lanzar a `encodeURIComponent` en plena plantilla, y el del backend puede venir ya partido.
 */
export function assistantWhatsappUrl(message: string): string {
  const whole = message.replace(LONE_SURROGATE, '');
  const text = encodeURIComponent(cutText(whole, SUPPORT_TEXT_MAX_LENGTH));
  return `${SUPPORT_WHATSAPP_URL}?text=${text}`;
}

/**
 * La pregunta puede traer una cuenta, una llave, un correo o un monto: nada de eso viaja al
 * WhatsApp. Soporte lo pide si lo necesita. Es lo mismo que hace `maskCaseText` en el backend.
 */
export function maskSupportQuestion(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(EMAIL, MASK)
    .replace(PAYMENT_KEY, `$1@${MASK}`)
    .replace(LONG_TOKEN, MASK)
    .replace(DIGIT_SEPARATOR, '$1')
    .replace(NUMBER, MASK)
    .replace(/[«»]/g, '"')
    .trim();
}

/**
 * El mensaje cuando el backend no trae `supportText`: el pulgar abajo sobre una respuesta normal,
 * un error de la web o un backend viejo.
 */
export function buildAssistantSupportText(context: AssistantSupportContext): string {
  const name = context.name?.trim();
  const business = context.business?.trim();
  const question = context.question?.trim();
  const greeting = name
    ? `Hola, soy ${name}${business ? `, de ${business}` : ''}.`
    : `Hola${business ? `, escribo de ${business}` : ''}.`;

  return [
    greeting,
    question
      ? `Zaira no me pudo resolver esto: «${cutText(maskSupportQuestion(question), QUESTION_MAX_LENGTH)}».`
      : 'Necesito ayuda con YEP.',
    context.page ? `Estaba en ${context.page}.` : null,
    context.conversationId ? `Referencia del caso: ${context.conversationId}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
