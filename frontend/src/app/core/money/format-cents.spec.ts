import { formatCents, formatCentsForInput } from './format-cents';

const NBSP = '\u00a0';

describe('formatCents', () => {
  it.each([
    [0, `0,00${NBSP}€`],
    [5, `0,05${NBSP}€`],
    [1250, `12,50${NBSP}€`],
    [124800, `1.248,00${NBSP}€`],
    [123456789, `1.234.567,89${NBSP}€`],
    [-1250, `-12,50${NBSP}€`],
  ])('formats %i cents as %j', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it('shows an explicit plus sign when signed', () => {
    expect(formatCents(1250, { signed: true })).toBe(`+12,50${NBSP}€`);
    expect(formatCents(-1250, { signed: true })).toBe(`-12,50${NBSP}€`);
    expect(formatCents(0, { signed: true })).toBe(`0,00${NBSP}€`);
  });
});

describe('formatCentsForInput', () => {
  it.each([
    [1250, '12,50'],
    [123456, '1234,56'],
    [5, '0,05'],
  ])('formats %i cents as %j', (cents, expected) => {
    expect(formatCentsForInput(cents)).toBe(expected);
  });
});
