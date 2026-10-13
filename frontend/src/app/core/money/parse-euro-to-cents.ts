export const MAX_AMOUNT_CENTS = 99_999_999_99;

const THOUSANDS_GROUPED_INTEGER = /^[1-9]\d{0,2}(\.\d{3})+$/;
const PLAIN_INTEGER = /^\d*$/;
const NORMALIZED_AMOUNT = /^(\d*)(?:\.(\d{0,2}))?$/;
const MAX_INTEGER_DIGITS = 12;

export function parseEuroToCents(input: string): number | null {
  const compact = input.replace(/[\s\u00a0\u202f€]/g, '');
  if (compact === '') {
    return null;
  }

  const normalized = normalizeSeparators(compact);
  if (normalized === null) {
    return null;
  }

  const match = NORMALIZED_AMOUNT.exec(normalized);
  if (match === null) {
    return null;
  }

  const integerDigits = match[1] ?? '';
  const fractionDigits = match[2] ?? '';
  if (integerDigits === '' && fractionDigits === '') {
    return null;
  }
  if (integerDigits.replace(/^0+/, '').length > MAX_INTEGER_DIGITS) {
    return null;
  }

  const cents = Number(integerDigits || '0') * 100 + Number(fractionDigits.padEnd(2, '0'));
  return cents > MAX_AMOUNT_CENTS ? null : cents;
}

function normalizeSeparators(compact: string): string | null {
  const commaCount = compact.split(',').length - 1;
  if (commaCount > 1) {
    return null;
  }

  if (commaCount === 1) {
    const [integerPart = '', fractionPart = ''] = compact.split(',');
    const integerDigits = stripThousandsSeparators(integerPart);
    return integerDigits === null ? null : `${integerDigits}.${fractionPart}`;
  }

  if (THOUSANDS_GROUPED_INTEGER.test(compact)) {
    return compact.replaceAll('.', '');
  }

  return compact;
}

function stripThousandsSeparators(integerPart: string): string | null {
  if (PLAIN_INTEGER.test(integerPart)) {
    return integerPart;
  }
  if (THOUSANDS_GROUPED_INTEGER.test(integerPart)) {
    return integerPart.replaceAll('.', '');
  }
  return null;
}
