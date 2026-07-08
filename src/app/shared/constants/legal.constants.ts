/**
 * URLs y versión de los documentos legales y del canal de soporte.
 *
 * El contenido legal (Términos, Privacidad) vive en el landing como fuente de
 * verdad; la app solo enlaza a esas URLs públicas. `TERMS_VERSION` debe coincidir
 * con la fecha de "última actualización" publicada en el landing y se envía al
 * backend al registrarse para dejar rastro del consentimiento.
 */
export const LEGAL_BASE_URL = 'https://yaestapago.co';

export const TERMS_URL = `${LEGAL_BASE_URL}/terminos`;
export const PRIVACY_URL = `${LEGAL_BASE_URL}/privacidad`;

export const TERMS_VERSION = '2026-07';

/** Canal de contacto con servicio al cliente (mismo número que usa el landing). */
export const SUPPORT_WHATSAPP_URL = 'https://wa.me/573192771783';
