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
          import('./features/transactions/list/transactions.page').then((m) => m.TransactionsPage),
      },
      {
        path: 'capturar',
        title: 'Capturar · Finanzas',
        loadComponent: () => import('./features/capture/capture.page').then((m) => m.CapturePage),
      },
      {
        path: 'pendientes',
        title: 'Pendientes · Finanzas',
        loadComponent: () =>
          import('./features/drafts/inbox/draft-inbox.page').then((m) => m.DraftInboxPage),
      },
      {
        path: 'pendientes/:id',
        title: 'Revisar borrador · Finanzas',
        loadComponent: () =>
          import('./features/drafts/review/draft-review.page').then((m) => m.DraftReviewPage),
      },
      {
        path: 'informes',
        title: 'Informes · Finanzas',
        loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPage),
      },
      {
        path: 'informes/patrimonio',
        title: 'Patrimonio · Finanzas',
        loadComponent: () =>
          import('./features/reports/net-worth.page').then((m) => m.NetWorthPage),
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
        path: 'mas/etiquetas',
        title: 'Etiquetas · Finanzas',
        loadComponent: () =>
          import('./features/transactions/tags/tags.page').then((m) => m.TagsPage),
      },
      {
        path: 'mas/fijos',
        title: 'Fijos · Finanzas',
        loadComponent: () =>
          import('./features/recurring/recurring.page').then((m) => m.RecurringPage),
      },
      {
        path: 'mas/fijos/nuevo',
        title: 'Nuevo fijo · Finanzas',
        loadComponent: () =>
          import('./features/recurring/recurring-editor.page').then((m) => m.RecurringEditorPage),
      },
      {
        path: 'mas/fijos/:id',
        title: 'Editar fijo · Finanzas',
        loadComponent: () =>
          import('./features/recurring/recurring-editor.page').then((m) => m.RecurringEditorPage),
      },
      {
        path: 'mas/presupuestos',
        title: 'Presupuestos · Finanzas',
        loadComponent: () => import('./features/budgets/budgets.page').then((m) => m.BudgetsPage),
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
