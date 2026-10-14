import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeftRight,
  lucideChartPie,
  lucideEllipsis,
  lucideHouse,
  lucideLogOut,
  lucidePlus,
} from '@ng-icons/lucide';
import { AuthStore } from '../../core/auth/auth.store';
import { filter } from 'rxjs';
import { PendingDrafts } from '../drafts/pending-drafts';
import { MovementSheets } from '../transactions/movement-sheets';
import { MovementSheetsHost } from '../transactions/movement-sheets-host';
import { NAV_ITEMS } from './nav-items';

@Component({
  selector: 'app-shell-layout',
  imports: [MovementSheetsHost, RouterOutlet, RouterLink, RouterLinkActive, NgIcon],
  providers: [
    provideIcons({
      lucideArrowLeftRight,
      lucideChartPie,
      lucideEllipsis,
      lucideHouse,
      lucideLogOut,
      lucidePlus,
    }),
  ],
  host: { class: 'flex min-h-dvh bg-muted/40' },
  template: `
    <aside
      class="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-border bg-background px-4 py-6 md:flex"
    >
      <p class="px-3 text-lg font-semibold text-primary-text">Finanzas</p>
      <nav class="mt-8 flex flex-1 flex-col gap-1" aria-label="Navegación principal">
        @for (item of navItems; track item.path) {
          @if (item.primary) {
            <button
              type="button"
              class="flex items-center gap-3 rounded-xl px-3 py-2 text-start text-sm font-medium text-foreground transition-colors hover:bg-muted"
              (click)="sheets.openQuickAdd()"
            >
              <ng-icon [name]="item.icon" size="20" aria-hidden="true" />
              {{ item.label }}
            </button>
          } @else {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-primary/10 text-primary-text"
              [routerLinkActiveOptions]="{ exact: item.exact }"
              class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <ng-icon [name]="item.icon" size="20" aria-hidden="true" />
              {{ item.label }}
              @if (item.showsPendingDrafts && pendingCount() > 0) {
                <span
                  class="ms-auto min-w-5 rounded-full bg-primary px-1.5 text-center text-xs leading-5 font-semibold text-primary-foreground"
                  data-testid="drafts-badge"
                  ><span aria-hidden="true">{{ pendingCount() }}</span
                  ><span class="sr-only">, {{ pendingLabel() }}</span></span
                >
              }
            </a>
          }
        }
      </nav>
      <div class="border-t border-border pt-4">
        <p class="truncate px-3 text-xs text-muted-foreground">{{ authStore.user()?.email }}</p>
        <button
          type="button"
          class="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          (click)="logout()"
        >
          <ng-icon name="lucideLogOut" size="20" aria-hidden="true" />
          Cerrar sesión
        </button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <main class="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-10">
        <router-outlet />
      </main>
    </div>

    <nav
      class="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Navegación principal"
    >
      <ul class="mx-auto grid max-w-md grid-cols-5 items-end">
        @for (item of navItems; track item.path) {
          <li class="flex justify-center">
            @if (item.primary) {
              <button
                type="button"
                class="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background"
                [attr.aria-label]="item.label"
                (click)="sheets.openQuickAdd()"
              >
                <ng-icon [name]="item.icon" size="28" aria-hidden="true" />
              </button>
            } @else {
              <a
                [routerLink]="item.path"
                routerLinkActive="text-primary-text"
                [routerLinkActiveOptions]="{ exact: item.exact }"
                class="relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
              >
                <ng-icon [name]="item.icon" size="22" aria-hidden="true" />
                {{ item.label }}
                @if (item.showsPendingDrafts && pendingCount() > 0) {
                  <span
                    class="absolute top-1.5 left-1/2 ms-2 min-w-4.5 rounded-full bg-primary px-1 text-center text-[10px] leading-4.5 font-semibold text-primary-foreground"
                    data-testid="drafts-badge"
                    ><span aria-hidden="true">{{ pendingCount() }}</span
                    ><span class="sr-only">, {{ pendingLabel() }}</span></span
                  >
                }
              </a>
            }
          </li>
        }
      </ul>
    </nav>

    <app-movement-sheets-host />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellLayout {
  protected readonly authStore = inject(AuthStore);
  protected readonly navItems = NAV_ITEMS;
  protected readonly sheets = inject(MovementSheets);
  private readonly pendingDrafts = inject(PendingDrafts);
  protected readonly pendingCount = this.pendingDrafts.count;

  constructor() {
    void this.pendingDrafts.refresh();
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => void this.pendingDrafts.refresh());
  }

  protected pendingLabel(): string {
    const count = this.pendingCount();
    return count === 1 ? '1 pendiente' : `${count} pendientes`;
  }

  protected logout(): void {
    void this.authStore.logout();
  }
}
