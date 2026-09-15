import type {
  ExpectedValues,
  ParsedBankNotification,
  TransactionDateSource,
} from '../../../shared/models/bank.models';

const SOURCE_LABELS: Record<TransactionDateSource, string> = {
  text: 'texto',
  post_time: 'postTime',
  header_date: 'header correo',
  captured_at: 'captura',
};

/** Formatea una fecha (ISO o cualquier string que entienda `Date`) a "dd/mm/aaaa HH:MM". */
export function formatTransactionDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(' ');
}

/** Etiqueta legible de un origen de fecha (`text`, `post_time`, `header_date`, `captured_at`). */
export function transactionDateSourceLabel(
  source?: TransactionDateSource | string | null,
): string {
  if (!source) return '';
  return SOURCE_LABELS[source as TransactionDateSource] ?? source;
}

/**
 * `true` si el ejemplo declaró fecha/origen esperados y no coinciden con lo
 * extraído. La fecha se compara por instante (epoch), igual que el backend.
 */
export function transactionDateMismatch(
  expected: ExpectedValues | null | undefined,
  parsed: ParsedBankNotification | undefined,
): boolean {
  if (!expected) return false;
  if (expected.transactionDate) {
    const expectedTime = new Date(expected.transactionDate).getTime();
    const actualTime = parsed?.transactionDate ? new Date(parsed.transactionDate).getTime() : NaN;
    if (Number.isNaN(expectedTime) || expectedTime !== actualTime) return true;
  }
  if (expected.transactionDateSource && expected.transactionDateSource !== parsed?.transactionDateSource) {
    return true;
  }
  return false;
}

/** Resumen legible de la fecha/origen esperados de un ejemplo (para chips de ❌). */
export function expectedDateSummary(expected?: ExpectedValues | null): string {
  if (!expected) return '';
  const parts: string[] = [];
  if (expected.transactionDate) parts.push(formatTransactionDate(expected.transactionDate));
  if (expected.transactionDateSource) parts.push(transactionDateSourceLabel(expected.transactionDateSource));
  return parts.join(' · ');
}
