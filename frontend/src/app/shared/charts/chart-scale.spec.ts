import { linearScale, niceDomain } from './chart-scale';

describe('niceDomain', () => {
  it('starts at zero and rounds the top to a clean step', () => {
    expect(niceDomain([0, 157500, 210000])).toEqual({
      min: 0,
      max: 250000,
      ticks: [0, 50000, 100000, 150000, 200000, 250000],
    });
  });

  it('spans negative values symmetrically around clean steps', () => {
    expect(niceDomain([-1200, 2500, 4000])).toEqual({
      min: -2000,
      max: 4000,
      ticks: [-2000, 0, 2000, 4000],
    });
  });

  it('keeps a usable domain when every value is zero or missing', () => {
    expect(niceDomain([0, null, 0])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });
});

describe('linearScale', () => {
  it('maps the domain onto an inverted pixel range', () => {
    const scale = linearScale({ min: 0, max: 100 }, 200, 0);
    expect(scale(0)).toBe(200);
    expect(scale(50)).toBe(100);
    expect(scale(100)).toBe(0);
  });
});
