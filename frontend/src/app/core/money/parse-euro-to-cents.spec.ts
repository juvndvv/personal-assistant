import { MAX_AMOUNT_CENTS, parseEuroToCents } from './parse-euro-to-cents';

describe('parseEuroToCents', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12,50', 1250],
    ['12.50', 1250],
    ['12.5', 1250],
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1.234.567,89', 123456789],
    ['12.500', 1250000],
    ['0,99', 99],
    ['0,05', 5],
    [',5', 50],
    ['12,', 1200],
    ['0', 0],
    ['  12,50  ', 1250],
    ['12,50 €', 1250],
    ['12,50\u00a0€', 1250],
    ['€12', 1200],
    ['99999999,99', MAX_AMOUNT_CENTS],
    ['99.999.999,99', MAX_AMOUNT_CENTS],
  ])('parses %j as %i cents', (input, expected) => {
    expect(parseEuroToCents(input)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['-12'],
    ['-0,50'],
    ['12-'],
    ['12,345'],
    ['12.345,678'],
    ['0.500'],
    ['1,2,3'],
    ['12,50.3'],
    ['1.23.4'],
    ['12a'],
    ['abc'],
    ['1e3'],
    ['+12'],
    [','],
    ['.'],
    ['100000000,00'],
    ['99999999999999999999'],
  ])('rejects %j', (input) => {
    expect(parseEuroToCents(input)).toBeNull();
  });

  it('never loses precision on values that are inexact as binary floats', () => {
    expect(parseEuroToCents('0,29')).toBe(29);
    expect(parseEuroToCents('1,15')).toBe(115);
    expect(parseEuroToCents('4,35')).toBe(435);
    expect(parseEuroToCents('1.005,07')).toBe(100507);
  });
});
