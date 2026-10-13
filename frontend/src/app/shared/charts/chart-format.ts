const BASIS_POINTS_PER_UNIT = 10_000;
const CENTS_PER_EURO = 100;
const MISSING = '—';
const NO_BREAK_SPACE = '\u00a0';

const percentFormatter = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  maximumFractionDigits: 1,
});

const compactEuroFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const decimalFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

const shortMonthFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  month: 'short',
});

export function formatBasisPoints(basisPoints: number | null): string {
  return basisPoints === null
    ? MISSING
    : percentFormatter.format(basisPoints / BASIS_POINTS_PER_UNIT);
}

export function formatAxisCents(cents: number): string {
  return compactEuroFormatter.format(cents / CENTS_PER_EURO);
}

export function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

export function formatSeconds(seconds: number | null): string {
  return seconds === null ? MISSING : `${decimalFormatter.format(seconds)}${NO_BREAK_SPACE}s`;
}

export function shortPeriodLabel(label: string): string {
  const [year, month] = label.split('-').map(Number);
  if (year === undefined || month === undefined || Number.isNaN(year) || Number.isNaN(month)) {
    return label;
  }
  const monthName = shortMonthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
  return `${monthName.replace('.', '')} ${String(year).slice(2)}`;
}
