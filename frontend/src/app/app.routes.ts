import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';
import { devRoutes } from './features/dev/dev.routes';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · Finanzas',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'sin-conexion',
    title: 'Sin conexión · Finanzas',
    loadComponent: () =>
      import('./features/unavailable/unavailable.page').then((m) => m.UnavailablePage),
  },
  ...devRoutes,
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell.layout').then((m) => m.ShellLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Inicio · Finanzas',
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'movimientos',
        title: 'Movimientos · Finanzas',
        loadComponent: () =>
          import('./features/movements/movements.page').then((m) => m.MovementsPage),
      },
      {
        path: 'capturar',
        title: 'Capturar · Finanzas',
        loadComponent: () => import('./features/capture/capture.page').then((m) => m.CapturePage),
      },
      {
        path: 'informes',
        title: 'Informes · Finanzas',
        loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPage),
      },
      {
        path: 'mas',
        title: 'Más · Finanzas',
        loadComponent: () => import('./features/more/more.page').then((m) => m.MorePage),
      },
      {
        path: 'mas/categorias',
        title: 'Categorías · Finanzas',
        loadComponent: () =>
          import('./features/categories/categories.page').then((m) => m.CategoriesPage),
      },
      {
        path: 'mas/ajustes',
        title: 'Ajustes · Finanzas',
        loadComponent: () =>
          import('./features/settings/settings.page').then((m) => m.SettingsPage),
      },
      {
        path: 'cuentas',
        title: 'Cuentas · Finanzas',
        loadComponent: () =>
          import('./features/accounts/accounts.page').then((m) => m.AccountsPage),
      },
      {
        path: 'cuentas/nueva',
        title: 'Nueva cuenta · Finanzas',
        loadComponent: () =>
          import('./features/accounts/account-editor.page').then((m) => m.AccountEditorPage),
      },
      {
        path: 'cuentas/:id',
        title: 'Cuenta · Finanzas',
        loadComponent: () =>
          import('./features/accounts/account-detail.page').then((m) => m.AccountDetailPage),
      },
      {
        path: 'cuentas/:id/editar',
        title: 'Editar cuenta · Finanzas',
        loadComponent: () =>
          import('./features/accounts/account-editor.page').then((m) => m.AccountEditorPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
