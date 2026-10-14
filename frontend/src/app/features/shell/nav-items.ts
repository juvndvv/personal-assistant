export interface RouteNavItem {
  id: string;
  label: string;
  icon: string;
  primary: false;
  path: string;
  exact: boolean;
  alsoMatches?: readonly string[];
  showsPendingDrafts?: boolean;
}

export interface QuickAddNavItem {
  id: 'quick-add';
  label: string;
  icon: string;
  primary: true;
}

export type NavItem = RouteNavItem | QuickAddNavItem;

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', path: '/', label: 'Inicio', icon: 'lucideHouse', exact: true, primary: false },
  {
    id: 'movements',
    path: '/movimientos',
    label: 'Movimientos',
    icon: 'lucideArrowLeftRight',
    exact: false,
    primary: false,
    alsoMatches: ['/pendientes'],
    showsPendingDrafts: true,
  },
  { id: 'quick-add', label: 'Añadir movimiento', icon: 'lucidePlus', primary: true },
  {
    id: 'reports',
    path: '/informes',
    label: 'Informes',
    icon: 'lucideChartPie',
    exact: false,
    primary: false,
  },
  {
    id: 'more',
    path: '/mas',
    label: 'Más',
    icon: 'lucideEllipsis',
    exact: false,
    primary: false,
    alsoMatches: ['/cuentas'],
  },
];

function isWithin(prefix: string, path: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function navItemMatches(item: RouteNavItem, path: string): boolean {
  if (item.exact) {
    return path === item.path;
  }
  return [item.path, ...(item.alsoMatches ?? [])].some((prefix) => isWithin(prefix, path));
}
