import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IsActiveMatchOptions, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-reports-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav
      aria-label="Secciones de informes"
      class="inline-flex gap-1 rounded-capsule bg-muted p-1 dark:bg-grouped"
    >
      <a
        routerLink="/informes"
        routerLinkActive="is-active"
        [routerLinkActiveOptions]="exactPath"
        ariaCurrentWhenActive="page"
        class="inline-flex min-h-11 items-center rounded-capsule px-4 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground aria-[current=page]:bg-card aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:shadow-sm aria-[current=page]:ring-1 aria-[current=page]:ring-segment-indicator-edge aria-[current=page]:ring-inset dark:aria-[current=page]:bg-fill-strong"
        >Periodo</a
      >
      <a
        routerLink="/informes/patrimonio"
        routerLinkActive="is-active"
        ariaCurrentWhenActive="page"
        class="inline-flex min-h-11 items-center rounded-capsule px-4 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground aria-[current=page]:bg-card aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:shadow-sm aria-[current=page]:ring-1 aria-[current=page]:ring-segment-indicator-edge aria-[current=page]:ring-inset dark:aria-[current=page]:bg-fill-strong"
        >Patrimonio</a
      >
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsNav {
  protected readonly exactPath: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };
}
