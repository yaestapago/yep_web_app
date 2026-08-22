import type {
  TransactionStatus,
  VerificationLevel,
} from '../models/transaction.models';

/**
 * Categoría amigable de una transacción para la operación diaria. Agrupa los
 * múltiples `TransactionStatus` técnicos del backend en cuatro estados que el
 * usuario entiende de un vistazo y que comparten un color consistente.
 * Centralizar aquí evita duplicar el mapeo en tabla, gráficas y modales.
 */
export type TransactionCategory = 'recibida' | 'verificada' | 'pendiente' | 'rechazada';

/** Nivel de color asociado, alineado con los tokens de estado del diseño. */
export type TransactionTone = 'neutral' | 'success' | 'warning' | 'error';

interface CategoryMeta {
  category: TransactionCategory;
  label: string;
  tone: TransactionTone;
}

const STATUS_TO_CATEGORY: Record<TransactionStatus, CategoryMeta> = {
  CREATED: { category: 'recibida', label: 'Recibida', tone: 'neutral' },
  PENDING_VERIFICATION: { category: 'pendiente', label: 'Pendiente', tone: 'warning' },
  NEEDS_REVIEW: { category: 'pendiente', label: 'Por revisar', tone: 'warning' },
  NEEDS_INPUT: { category: 'pendiente', label: 'Requiere dato', tone: 'warning' },
  EVIDENCE_MATCHED: { category: 'verificada', label: 'Verificada', tone: 'success' },
  BANK_VERIFIED: { category: 'verificada', label: 'Verificada por banco', tone: 'success' },
  MANUALLY_VERIFIED: { category: 'verificada', label: 'Verificada manualmente', tone: 'success' },
  REJECTED: { category: 'rechazada', label: 'Rechazada', tone: 'error' },
  DUPLICATE: { category: 'rechazada', label: 'Duplicada', tone: 'error' },
  CANCELLED: { category: 'rechazada', label: 'Cancelada', tone: 'error' },
};

const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  recibida: 'Recibida',
  verificada: 'Verificada',
  pendiente: 'Pendiente',
  rechazada: 'Rechazada',
};

const CATEGORY_ORDER: TransactionCategory[] = [
  'recibida',
  'verificada',
  'pendiente',
  'rechazada',
];

const CATEGORY_TONES: Record<TransactionCategory, TransactionTone> = {
  recibida: 'neutral',
  verificada: 'success',
  pendiente: 'warning',
  rechazada: 'error',
};

function metaFor(status: TransactionStatus): CategoryMeta {
  return (
    STATUS_TO_CATEGORY[status] ?? {
      category: 'recibida',
      label: status,
      tone: 'neutral',
    }
  );
}

/** Categoría amigable de un estado técnico. */
export function transactionCategory(status: TransactionStatus): TransactionCategory {
  return metaFor(status).category;
}

/** Etiqueta humana del estado técnico (más específica que la categoría). */
export function transactionStatusLabel(status: TransactionStatus): string {
  return metaFor(status).label;
}

/** Etiqueta de la categoría amigable (genérica). */
export function transactionCategoryLabel(category: TransactionCategory): string {
  return CATEGORY_LABELS[category];
}

/** Tono de color de un estado técnico. */
export function transactionTone(status: TransactionStatus): TransactionTone {
  return metaFor(status).tone;
}

/** Tono de color de una categoría. */
export function transactionCategoryTone(category: TransactionCategory): TransactionTone {
  return CATEGORY_TONES[category];
}

/** Orden estable de categorías para gráficas/segmentos. */
export const TRANSACTION_CATEGORIES = CATEGORY_ORDER;

/**
 * Estados técnicos que componen una categoría amigable. Lo usa el filtro
 * server-side: la UI elige una categoría y enviamos al backend la lista de
 * `TransactionStatus` que la integran (parámetro `statuses`), de modo que el
 * filtrado ocurra sobre toda la colección y no solo sobre lo ya cargado.
 */
export function statusesForCategory(
  category: TransactionCategory,
): TransactionStatus[] {
  return (Object.keys(STATUS_TO_CATEGORY) as TransactionStatus[]).filter(
    (status) => STATUS_TO_CATEGORY[status].category === category,
  );
}

const VERIFIABLE_STATUSES: TransactionStatus[] = [
  'CREATED',
  'PENDING_VERIFICATION',
  'NEEDS_REVIEW',
  'EVIDENCE_MATCHED',
];

/**
 * ¿Se puede lanzar la verificación manual? Aún no se considera pagada y su
 * estado lo admite. Comparte esta regla la tabla de transacciones y el
 * detalle del evento (ambos ofrecen el botón "Verificar").
 */
export function isTransactionVerifiable(
  status: TransactionStatus,
  canBeConsideredPaid: boolean,
): boolean {
  return !canBeConsideredPaid && VERIFIABLE_STATUSES.includes(status);
}

/** ¿Se puede asociar a una factura? Solo transacciones ya verificadas. */
export function isTransactionInvoiceable(status: TransactionStatus): boolean {
  return transactionCategory(status) === 'verificada';
}

const LEVEL_LABELS: Record<VerificationLevel, string> = {
  NONE: 'Sin validar',
  LOW: 'Confianza baja',
  MEDIUM: 'Confianza media',
  HIGH: 'Confianza alta',
  MANUAL: 'Validación manual',
};

export function verificationLevelLabel(level: VerificationLevel): string {
  return LEVEL_LABELS[level] ?? level;
}

export type ValidationMethod = 'automatica' | 'manual' | 'mixta' | 'pendiente';

/**
 * Deriva cómo se validó una transacción a partir de su estado y nivel:
 * - `manual`: verificación manual del dueño/usuario autorizado.
 * - `automatica`: emparejada por evidencia/banco sin intervención.
 * - `mixta`: emparejada automáticamente y además ratificada manualmente.
 * - `pendiente`: aún sin validar.
 */
export function validationMethod(
  status: TransactionStatus,
  level: VerificationLevel,
): ValidationMethod {
  if (status === 'MANUALLY_VERIFIED') {
    return level === 'HIGH' ? 'mixta' : 'manual';
  }
  if (status === 'EVIDENCE_MATCHED' || status === 'BANK_VERIFIED') {
    return 'automatica';
  }
  if (level === 'MANUAL') {
    return 'manual';
  }
  return 'pendiente';
}

const VALIDATION_METHOD_LABELS: Record<ValidationMethod, string> = {
  automatica: 'Validación automática',
  manual: 'Validación manual',
  mixta: 'Validación mixta',
  pendiente: 'Pendiente de validación',
};

export function validationMethodLabel(method: ValidationMethod): string {
  return VALIDATION_METHOD_LABELS[method];
}
