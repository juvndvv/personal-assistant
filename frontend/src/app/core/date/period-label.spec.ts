import { formatPeriodLabel, isPeriodLabel, shiftPeriodLabel } from './period-label';

describe('formatPeriodLabel', () => {
  it.each([
    ['2026-10', 'octubre de 2026'],
    ['2027-01', 'enero de 2027'],
  ])('formats %j as %j', (label, expected) => {
    expect(formatPeriodLabel(label)).toBe(expected);
  });

  it('returns unknown formats unchanged', () => {
    expect(formatPeriodLabel('2026')).toBe('2026');
  });
});

describe('shiftPeriodLabel', () => {
  it.each([
    ['2026-10', -1, '2026-09'],
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-10', -12, '2025-10'],
  ])('shifts %j by %j to %j', (label, delta, expected) => {
    expect(shiftPeriodLabel(label, delta)).toBe(expected);
  });
});

describe('isPeriodLabel', () => {
  it('accepts only YYYY-MM labels with a valid month', () => {
    expect(isPeriodLabel('2026-10')).toBe(true);
    expect(isPeriodLabel('2026-13')).toBe(false);
    expect(isPeriodLabel('2026-1')).toBe(false);
    expect(isPeriodLabel(null)).toBe(false);
  });
});
