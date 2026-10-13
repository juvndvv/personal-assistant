import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronRight,
  lucideFolderTree,
  lucideSettings,
  lucideWallet,
} from '@ng-icons/lucide';
import { AuthStore } from '../../core/auth/auth.store';
import { PageHeader } from '../../shared/layout/page-header';
import { UiButton } from '../../shared/ui';

interface MoreLink {
  path: string;
  label: string;
  description: string;
  icon: string;
}

const MORE_LINKS: readonly MoreLink[] = [
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
    path: '/mas/ajustes',
    label: 'Ajustes',
    description: 'Inicio del mes, cuenta por defecto y borradores.',
    icon: 'lucideSettings',
  },
];

@Component({
  selector: 'app-more-page',
  imports: [NgIcon, PageHeader, RouterLink, UiButton],
  providers: [provideIcons({ lucideChevronRight, lucideFolderTree, lucideSettings, lucideWallet })],
  template: `
    <app-page-header title="Más" subtitle="Cuentas, categorías, ajustes y sesión." />
    <nav aria-label="Más opciones" class="mb-6">
      <ul
        class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background"
      >
        @for (link of links; track link.path) {
          <li>
            <a [routerLink]="link.path" class="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
              <ng-icon [name]="link.icon" size="20" class="text-primary" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span class="block font-medium text-foreground">{{ link.label }}</span>
                <span class="block text-xs text-muted-foreground">{{ link.description }}</span>
              </span>
              <ng-icon name="lucideChevronRight" class="text-muted-foreground" aria-hidden="true" />
            </a>
          </li>
        }
      </ul>
    </nav>
    <section class="rounded-2xl border border-border bg-background p-4">
      <p class="text-sm text-muted-foreground">Sesión iniciada como</p>
      <p class="font-medium text-foreground">{{ authStore.user()?.email }}</p>
      <div class="mt-4">
        <ui-button variant="outline" (clicked)="logout()">Cerrar sesión</ui-button>
      </div>
    </section>
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
