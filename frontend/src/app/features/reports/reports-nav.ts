import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IsActiveMatchOptions, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-reports-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav aria-label="Secciones de informes" class="inline-flex gap-1 rounded-xl bg-muted p-1">
      <a
        routerLink="/informes"
        routerLinkActive="bg-background text-foreground shadow-xs"
        [routerLinkActiveOptions]="exactPath"
        ariaCurrentWhenActive="page"
        class="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >Periodo</a
      >
      <a
        routerLink="/informes/patrimonio"
        routerLinkActive="bg-background text-foreground shadow-xs"
        ariaCurrentWhenActive="page"
        class="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
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
