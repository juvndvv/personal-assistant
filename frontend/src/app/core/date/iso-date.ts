export type IsoDate = string;
export type DateStyle = 'short' | 'medium' | 'long';

const MADRID_TIME_ZONE = 'Europe/Madrid';
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

const madridCalendarFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MADRID_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const displayFormatters: Record<DateStyle, Intl.DateTimeFormat> = {
  short: new Intl.DateTimeFormat('es-ES', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }),
  medium: new Intl.DateTimeFormat('es-ES', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }),
  long: new Intl.DateTimeFormat('es-ES', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
};

export function todayInMadrid(now: Date = new Date()): IsoDate {
  return madridCalendarFormatter.format(now);
}

export function isIsoDate(value: string): value is IsoDate {
  const parts = parseIsoDate(value);
  if (parts === null) {
    return false;
  }
  const { year, month, day } = parts;
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromUtcMilliseconds(toUtcMilliseconds(iso) + days * MILLISECONDS_PER_DAY);
}

export function compareIsoDates(left: IsoDate, right: IsoDate): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function formatDate(iso: IsoDate, style: DateStyle = 'short'): string {
  return displayFormatters[style].format(new Date(toUtcMilliseconds(iso))).replace('.', '');
}

function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function toUtcMilliseconds(iso: IsoDate): number {
  const parts = parseIsoDate(iso);
  if (parts === null) {
    throw new RangeError(`Invalid ISO date: ${iso}`);
  }
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function fromUtcMilliseconds(milliseconds: number): IsoDate {
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
