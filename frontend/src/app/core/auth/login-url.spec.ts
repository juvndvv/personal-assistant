import { loginUrlFor, safeReturnUrl, unavailableUrlFor } from './login-url';

describe('safeReturnUrl', () => {
  it.each([
    [undefined, '/'],
    [null, '/'],
    ['', '/'],
    ['/informes?period=2026-10', '/informes?period=2026-10'],
    ['//evil.example.com', '/'],
    ['https://evil.example.com', '/'],
  ])('maps %j to %j', (candidate, expected) => {
    expect(safeReturnUrl(candidate)).toBe(expected);
  });
});

describe('loginUrlFor', () => {
  it.each([
    ['/', '/login'],
    ['', '/login'],
    ['/login?returnUrl=%2Fmas', '/login'],
    ['/movimientos', '/login?returnUrl=%2Fmovimientos'],
  ])('maps %j to %j', (returnUrl, expected) => {
    expect(loginUrlFor(returnUrl)).toBe(expected);
  });
});

describe('unavailableUrlFor', () => {
  it.each([
    ['/movimientos', '/sin-conexion?returnUrl=%2Fmovimientos'],
    ['/', '/sin-conexion?returnUrl=%2F'],
    ['/login?returnUrl=%2Fmas', '/sin-conexion?returnUrl=%2Flogin%3FreturnUrl%3D%252Fmas'],
    ['/sin-conexion?returnUrl=%2Fmas', '/sin-conexion?returnUrl=%2F'],
    ['//evil.example.com', '/sin-conexion?returnUrl=%2F'],
  ])('maps %j to %j', (returnUrl, expected) => {
    expect(unavailableUrlFor(returnUrl)).toBe(expected);
  });
});
