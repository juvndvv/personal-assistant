import { EurPipe } from './eur.pipe';

describe('EurPipe', () => {
  const pipe = new EurPipe();

  it('formats integer cents as Spanish euros', () => {
    expect(pipe.transform(124800)).toBe('1.248,00\u00a0€');
  });

  it('supports a signed display', () => {
    expect(pipe.transform(-4550, { signed: true })).toBe('-45,50\u00a0€');
    expect(pipe.transform(4550, { signed: true })).toBe('+45,50\u00a0€');
  });

  it('renders nothing for missing values', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
