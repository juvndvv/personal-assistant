import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronRight,
  lucideChartPie,
  lucideDownload,
  lucideFolderTree,
  lucideInbox,
  lucideRepeat,
  lucideSettings,
  lucideTags,
  lucideWallet,
} from '@ng-icons/lucide';
import { AuthStore } from '../../core/auth/auth.store';
import { PageHeader } from '../../shared/layout/page-header';
import { UiButton, UiCard } from '../../shared/ui';

interface MoreLink {
  path: string;
  label: string;
  description: string;
  icon: string;
}

const MORE_LINKS: readonly MoreLink[] = [
  {
    path: '/pendientes',
    label: 'Pendientes',
    description: 'Borradores de voz, foto y fijos variables por revisar.',
    icon: 'lucideInbox',
  },
  {
    path: '/mas/fijos',
    label: 'Fijos',
    description: 'Nómina, alquiler y facturas que se registran solos.',
    icon: 'lucideRepeat',
  },
  {
    path: '/mas/presupuestos',
    label: 'Presupuestos',
    description: 'Límite mensual por categoría de gasto.',
    icon: 'lucideChartPie',
  },
  {
    path: '/cuentas',
    label: 'Cuentas',
    description: 'Saldos, tarjetas y ajustes de saldo.',
    icon: 'lucideWallet',
  },
  {
    path: '/mas/categorias',
    label: 'Categorías',
    description: 'Categorías y subcategorías de gastos e ingresos.',
    icon: 'lucideFolderTree',
  },
  {
    path: '/mas/etiquetas',
    label: 'Etiquetas',
    description: 'Renombra o elimina las etiquetas de tus movimientos.',
    icon: 'lucideTags',
  },
  {
    path: '/mas/exportar',
    label: 'Exportar datos',
    description: 'Descarga todo en CSV o un ZIP completo con justificantes.',
    icon: 'lucideDownload',
  },
  {
    path: '/mas/ajustes',
    label: 'Ajustes',
    description: 'Inicio del mes, cuenta por defecto y borradores.',
    icon: 'lucideSettings',
  },
];

@Component({
  selector: 'app-more-page',
  imports: [NgIcon, PageHeader, RouterLink, UiButton, UiCard],
  providers: [
    provideIcons({
      lucideChartPie,
      lucideChevronRight,
      lucideDownload,
      lucideFolderTree,
      lucideInbox,
      lucideRepeat,
      lucideSettings,
      lucideTags,
      lucideWallet,
    }),
  ],
  template: `
    <app-page-header title="Más" subtitle="Cuentas, categorías, ajustes y sesión." />
    <div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
      <nav aria-label="Más opciones">
        <ul uiCard divided>
          @for (link of links; track link.path) {
            <li>
              <a
                [routerLink]="link.path"
                class="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-hover active:bg-pressed"
              >
                <span
                  class="flex size-9 shrink-0 items-center justify-center rounded-full bg-fill-on-card text-foreground"
                  aria-hidden="true"
                >
                  <ng-icon [name]="link.icon" size="18" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block font-medium text-foreground">{{ link.label }}</span>
                  <span class="block text-sm text-muted-foreground">{{ link.description }}</span>
                </span>
                <ng-icon
                  name="lucideChevronRight"
                  class="text-subtle-foreground"
                  aria-hidden="true"
                />
              </a>
            </li>
          }
        </ul>
      </nav>
      <section uiCard aria-labelledby="session-heading">
        <h2 id="session-heading" class="text-sm text-muted-foreground">Sesión iniciada como</h2>
        <p class="mt-0.5 font-medium break-all text-foreground">{{ authStore.user()?.email }}</p>
        <div class="mt-4">
          <ui-button variant="outline" (clicked)="logout()">Cerrar sesión</ui-button>
        </div>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MorePage {
  protected readonly authStore = inject(AuthStore);
  protected readonly links = MORE_LINKS;

  protected logout(): void {
    void this.authStore.logout();
  }
}
