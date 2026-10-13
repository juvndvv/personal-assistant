import {
  formatAxisCents,
  formatBasisPoints,
  formatDecimal,
  formatSeconds,
  shortPeriodLabel,
} from './chart-format';

const nbsp = (text: string) => text.replace(/ /g, '\u00a0');

describe('chart formatting', () => {
  it('formats basis points as Spanish percentages', () => {
    expect(formatBasisPoints(2500)).toBe(nbsp('25 %'));
    expect(formatBasisPoints(2667)).toBe(nbsp('26,7 %'));
    expect(formatBasisPoints(-1250)).toBe(nbsp('-12,5 %'));
    expect(formatBasisPoints(null)).toBe('—');
  });

  it('formats axis amounts compactly in euros', () => {
    expect(formatAxisCents(0)).toBe(nbsp('0 €'));
    expect(formatAxisCents(80000)).toBe(nbsp('800 €'));
    expect(formatAxisCents(150000)).toBe(nbsp('1,5 mil €'));
  });

  it('formats seconds and decimals with a comma', () => {
    expect(formatSeconds(8.4)).toBe(nbsp('8,4 s'));
    expect(formatSeconds(null)).toBe('—');
    expect(formatDecimal(5.9)).toBe('5,9');
  });

  it('shortens period labels for axes', () => {
    expect(shortPeriodLabel('2026-10')).toBe('oct 26');
    expect(shortPeriodLabel('2027-01')).toBe('ene 27');
  });
});
