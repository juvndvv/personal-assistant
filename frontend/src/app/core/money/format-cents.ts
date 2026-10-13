const CENTS_PER_EURO = 100;

const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
});

const signedCurrencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
  signDisplay: 'exceptZero',
});

export interface FormatCentsOptions {
  signed?: boolean;
}

export function formatCents(cents: number, options: FormatCentsOptions = {}): string {
  const formatter = options.signed ? signedCurrencyFormatter : currencyFormatter;
  return formatter.format(cents / CENTS_PER_EURO);
}

export function formatCentsForInput(cents: number): string {
  const euros = Math.trunc(Math.abs(cents) / CENTS_PER_EURO);
  const remainder = Math.abs(cents) % CENTS_PER_EURO;
  const sign = cents < 0 ? '-' : '';
  return `${sign}${euros},${String(remainder).padStart(2, '0')}`;
}
