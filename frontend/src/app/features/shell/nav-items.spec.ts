import { NAV_ITEMS, RouteNavItem, navItemMatches } from './nav-items';

const routeItems = NAV_ITEMS.filter((item): item is RouteNavItem => !item.primary);

function activeIdFor(path: string): string | undefined {
  return routeItems.find((item) => navItemMatches(item, path))?.id;
}

describe('navItemMatches', () => {
  it.each([
    ['/', 'home'],
    ['/movimientos', 'movements'],
    ['/movimientos/12', 'movements'],
    ['/pendientes', 'movements'],
    ['/pendientes/88', 'movements'],
    ['/informes', 'reports'],
    ['/mas', 'more'],
    ['/mas/fijos', 'more'],
    ['/cuentas', 'more'],
    ['/cuentas/3', 'more'],
  ])('activates the right tab for %s', (path, id) => {
    expect(activeIdFor(path)).toBe(id);
  });

  it('does not match unrelated prefixes', () => {
    expect(activeIdFor('/cuentasx')).toBeUndefined();
    expect(activeIdFor('/ajustes')).toBeUndefined();
  });
});
