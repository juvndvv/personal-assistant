import { formatPeriodLabel } from './period-label';

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
