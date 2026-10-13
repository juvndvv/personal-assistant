const PERIOD_LABEL_PATTERN = /^(\d{4})-(\d{2})$/;

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
