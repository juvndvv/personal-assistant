export interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact: boolean;
  primary: boolean;
  showsPendingDrafts?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', label: 'Inicio', icon: 'lucideHouse', exact: true, primary: false },
  {
    path: '/movimientos',
    label: 'Movimientos',
    icon: 'lucideArrowLeftRight',
    exact: false,
    primary: false,
    showsPendingDrafts: true,
  },
  {
    path: '/capturar',
    label: 'Añadir movimiento',
    icon: 'lucidePlus',
    exact: false,
    primary: true,
  },
  { path: '/informes', label: 'Informes', icon: 'lucideChartPie', exact: false, primary: false },
  { path: '/mas', label: 'Más', icon: 'lucideEllipsis', exact: false, primary: false },
];
