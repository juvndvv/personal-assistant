const PERIOD_LABEL_PATTERN = /^(\d{4})-(\d{2})$/;
const VALID_PERIOD_LABEL = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS_PER_YEAR = 12;

const periodFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

export function formatPeriodLabel(label: string): string {
  const match = PERIOD_LABEL_PATTERN.exec(label);
  if (match === null) {
    return label;
  }
  return periodFormatter.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

export function isPeriodLabel(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && VALID_PERIOD_LABEL.test(value);
}

export function shiftPeriodLabel(label: string, delta: number): string {
  const match = PERIOD_LABEL_PATTERN.exec(label);
  if (match === null) {
    return label;
  }
  const monthIndex = Number(match[1]) * MONTHS_PER_YEAR + Number(match[2]) - 1 + delta;
  const year = Math.floor(monthIndex / MONTHS_PER_YEAR);
  const month = (monthIndex % MONTHS_PER_YEAR) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}
