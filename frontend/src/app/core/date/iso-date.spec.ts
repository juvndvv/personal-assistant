import { addDays, compareIsoDates, formatDate, isIsoDate, todayInMadrid } from './iso-date';

describe('todayInMadrid', () => {
  it('returns the Madrid calendar date late in the UTC evening (summer time)', () => {
    expect(todayInMadrid(new Date('2026-07-31T22:30:00Z'))).toBe('2026-08-01');
  });

  it('returns the Madrid calendar date early in the UTC morning (winter time)', () => {
    expect(todayInMadrid(new Date('2026-12-31T23:15:00Z'))).toBe('2027-01-01');
    expect(todayInMadrid(new Date('2026-12-31T22:59:59Z'))).toBe('2026-12-31');
  });

  it('returns an ISO date for the current instant', () => {
    expect(isIsoDate(todayInMadrid())).toBe(true);
  });
});

describe('isIsoDate', () => {
  it.each(['2026-10-13', '2024-02-29', '2026-12-31', '2026-01-01'])('accepts %s', (value) => {
    expect(isIsoDate(value)).toBe(true);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '26-10-13', '2026-1-1', ''])(
    'rejects %j',
    (value) => {
      expect(isIsoDate(value)).toBe(false);
    },
  );
});

describe('addDays', () => {
  it.each([
    ['2026-10-13', 1, '2026-10-14'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2026-03-29', 0, '2026-03-29'],
    ['2026-10-25', 1, '2026-10-26'],
  ])('%s + %i days = %s', (iso, days, expected) => {
    expect(addDays(iso, days)).toBe(expected);
  });
});

describe('compareIsoDates', () => {
  it('orders calendar dates', () => {
    expect(compareIsoDates('2026-01-02', '2026-01-10')).toBeLessThan(0);
    expect(compareIsoDates('2026-01-10', '2026-01-02')).toBeGreaterThan(0);
    expect(compareIsoDates('2026-01-10', '2026-01-10')).toBe(0);
  });
});

describe('formatDate', () => {
  it('formats without shifting the calendar day', () => {
    expect(formatDate('2026-10-13')).toBe('13/10/2026');
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
    expect(formatDate('2026-03-29', 'long')).toBe('29 de marzo de 2026');
    expect(formatDate('2026-10-13', 'medium')).toBe('13 oct 2026');
  });
});
