import { Routes } from '@angular/router';

export const devRoutes: Routes = [
  {
    path: 'dev/kitchen-sink',
    title: 'Kitchen sink · Finanzas',
    loadComponent: () => import('./kitchen-sink.page').then((m) => m.KitchenSinkPage),
  },
];
