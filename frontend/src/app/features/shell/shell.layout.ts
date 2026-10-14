import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeftRight,
  lucideChartPie,
  lucideChevronLeft,
  lucideEllipsis,
  lucideHouse,
  lucideLogOut,
  lucidePlus,
} from '@ng-icons/lucide';
import { filter, map } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { PageChrome } from '../../shared/layout/page-chrome';
import { UiGlassBar } from '../../shared/ui';
import { PendingDrafts } from '../drafts/pending-drafts';
import { MovementSheets } from '../transactions/movement-sheets';
import { MovementSheetsHost } from '../transactions/movement-sheets-host';
import { NAV_ITEMS, NavItem } from './nav-items';

const ACTIVE_STROKE = '2.5';
const IDLE_STROKE = '1.75';
const PRIMARY_SLOT = '3.75rem';

function pathOf(url: string): string {
  return url.split(/[?#]/)[0] ?? '/';
}

function matches(item: NavItem, path: string): boolean {
  if (item.exact) {
    return path === item.path;
  }
  return path === item.path || path.startsWith(`${item.path}/`);
}

@Component({
  selector: 'app-shell-layout',
  imports: [MovementSheetsHost, NgIcon, RouterLink, RouterOutlet, UiGlassBar],
  providers: [
    provideIcons({
      lucideArrowLeftRight,
      lucideChartPie,
      lucideChevronLeft,
      lucideEllipsis,
      lucideHouse,
      lucideLogOut,
      lucidePlus,
    }),
  ],
  host: {
    class:
      'flex min-h-dvh [--shell-bottom-inset:calc(var(--tab-bar-height)+var(--tab-bar-offset)+0.75rem)] [--bottom-bar-safe-area:0px] md:[--shell-bottom-inset:0px] md:[--bottom-bar-safe-area:env(safe-area-inset-bottom)]',
  },
  template: `
    <aside
      class="glass glass-flat sticky top-0 z-30 hidden h-dvh w-64 shrink-0 flex-col px-3 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] md:flex"
    >
      <p class="px-3 text-lg font-semibold text-foreground">Finanzas</p>
      <nav class="mt-6 flex flex-1 flex-col gap-1" aria-label="Navegación principal">
        @for (item of navItems; track item.path; let index = $index) {
          @if (item.primary) {
            <button
              type="button"
              class="mb-3 flex min-h-11 items-center justify-center gap-2 rounded-capsule bg-primary px-4 text-[0.9375rem] font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/80 active:bg-primary/90"
              (click)="sheets.openQuickAdd()"
            >
              <ng-icon [name]="item.icon" size="20" aria-hidden="true" />
              {{ item.label }}
            </button>
          } @else {
            <a
              [routerLink]="item.path"
              [attr.aria-current]="index === activeIndex() ? 'page' : null"
              class="flex min-h-11 items-center gap-3 rounded-menu-item px-3 text-[0.9375rem] text-foreground transition-colors duration-150"
              [class]="
                index === activeIndex() ? 'bg-accent font-semibold' : 'font-medium hover:bg-hover'
              "
            >
              <ng-icon
                [name]="item.icon"
                size="20"
                aria-hidden="true"
                [strokeWidth]="index === activeIndex() ? activeStroke : idleStroke"
              />
              {{ item.label }}
              @if (item.showsPendingDrafts && pendingCount() > 0) {
                <span
                  class="ms-auto min-w-6 rounded-capsule bg-primary px-1.5 text-center text-xs leading-6 font-semibold text-primary-foreground"
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
          class="mt-2 flex min-h-11 w-full items-center gap-3 rounded-menu-item px-3 text-[0.9375rem] font-medium text-foreground transition-colors duration-150 hover:bg-hover"
          (click)="logout()"
        >
          <ng-icon name="lucideLogOut" size="20" aria-hidden="true" />
          Cerrar sesión
        </button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <ui-glass-bar position="top" data-testid="top-bar">
        <div class="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div class="flex min-w-0 items-center">
            @if (chrome.state()?.back; as back) {
              <a
                [routerLink]="back.link"
                class="-ms-2 inline-flex min-h-11 min-w-11 items-center gap-0.5 rounded-capsule pe-3 ps-1 text-[0.9375rem] font-medium text-foreground transition-colors duration-150 hover:bg-hover"
              >
                <ng-icon name="lucideChevronLeft" size="22" aria-hidden="true" />
                <span class="truncate">{{ back.label }}</span>
              </a>
            }
          </div>
          <p
            aria-hidden="true"
            class="max-w-[50vw] truncate text-center text-[0.9375rem] font-semibold text-foreground transition-opacity duration-200"
            [class.opacity-0]="chrome.largeTitleVisible()"
          >
            {{ chrome.state()?.title }}
          </p>
          <div></div>
        </div>
      </ui-glass-bar>
      <main
        class="mx-auto w-full max-w-6xl flex-1 px-4 pt-2 pb-[calc(var(--shell-bottom-inset)+1.5rem)] md:px-8 md:pt-4 md:pb-12"
      >
        <router-outlet />
      </main>
    </div>

    <nav
      class="fixed inset-x-4 bottom-[var(--tab-bar-offset)] z-40 md:hidden"
      aria-label="Navegación principal"
      data-testid="tab-bar"
    >
      <div class="glass relative mx-auto h-[var(--tab-bar-height)] max-w-md rounded-capsule px-1.5">
        @if (activeIndex() >= 0) {
          <span
            aria-hidden="true"
            data-testid="tab-indicator"
            class="pointer-events-none absolute inset-y-1.5 start-1.5 rounded-capsule bg-glass-fill transition-transform duration-[400ms] ease-spring"
            [style.width]="indicatorWidth"
            [style.transform]="indicatorTransform()"
          ></span>
        }
        <ul class="relative grid h-full grid-cols-[1fr_1fr_3.75rem_1fr_1fr] items-center">
          @for (item of navItems; track item.path; let index = $index) {
            <li class="flex h-full items-center justify-center">
              @if (item.primary) {
                <button
                  type="button"
                  class="flex h-11 w-[3.25rem] items-center justify-center rounded-capsule bg-primary text-primary-foreground shadow-glass transition-transform duration-150 active:scale-95"
                  [attr.aria-label]="item.label"
                  (click)="sheets.openQuickAdd()"
                >
                  <ng-icon [name]="item.icon" size="24" aria-hidden="true" strokeWidth="2.25" />
                </button>
              } @else {
                <a
                  [routerLink]="item.path"
                  [attr.aria-current]="index === activeIndex() ? 'page' : null"
                  class="relative flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-capsule text-xs"
                  [class]="
                    index === activeIndex()
                      ? 'font-semibold text-foreground'
                      : 'font-medium text-muted-foreground'
                  "
                >
                  <ng-icon
                    [name]="item.icon"
                    size="22"
                    aria-hidden="true"
                    [strokeWidth]="index === activeIndex() ? activeStroke : idleStroke"
                  />
                  <span class="max-w-full truncate tracking-[-0.02em]">{{ item.label }}</span>
                  @if (item.showsPendingDrafts && pendingCount() > 0) {
                    <span
                      class="absolute top-1 left-1/2 ms-2 min-w-5 rounded-capsule bg-primary px-1 text-center text-xs leading-5 font-semibold text-primary-foreground"
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
      </div>
    </nav>

    <app-movement-sheets-host />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellLayout {
  protected readonly authStore = inject(AuthStore);
  protected readonly chrome = inject(PageChrome);
  protected readonly navItems = NAV_ITEMS;
  protected readonly sheets = inject(MovementSheets);
  protected readonly activeStroke = ACTIVE_STROKE;
  protected readonly idleStroke = IDLE_STROKE;
  protected readonly indicatorWidth = `calc((100% - 0.75rem - ${PRIMARY_SLOT}) / ${NAV_ITEMS.length - 1})`;
  private readonly router = inject(Router);
  private readonly pendingDrafts = inject(PendingDrafts);
  protected readonly pendingCount = this.pendingDrafts.count;

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => pathOf(event.urlAfterRedirects)),
    ),
    { initialValue: pathOf(this.router.url) },
  );

  protected readonly activeIndex = computed(() => {
    const path = this.path();
    return this.navItems.findIndex((item) => !item.primary && matches(item, path));
  });
  protected readonly indicatorTransform = computed(() => {
    const index = this.activeIndex();
    const primaryIndex = this.navItems.findIndex((item) => item.primary);
    const afterPrimary = primaryIndex >= 0 && index > primaryIndex;
    const slots = afterPrimary ? index - 1 : index;
    return `translateX(calc(${slots} * 100% + ${afterPrimary ? PRIMARY_SLOT : '0px'}))`;
  });

  constructor() {
    this.chrome.attachHost();
    inject(DestroyRef).onDestroy(() => this.chrome.detachHost());
    void this.pendingDrafts.refresh();
    this.router.events
      .pipe(
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
