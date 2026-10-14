import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UiSkeleton } from '../../shared/ui/ui-skeleton';

@Component({
  selector: 'app-boot-splash',
  imports: [UiSkeleton],
  host: {
    class: 'flex min-h-dvh',
    role: 'status',
    'aria-live': 'polite',
    'data-testid': 'boot-splash',
  },
  template: `
    <span class="sr-only">Cargando Finanzas…</span>
    <aside
      class="glass glass-flat hidden w-64 shrink-0 flex-col gap-3 px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] md:flex"
      aria-hidden="true"
    >
      <p class="text-lg font-semibold text-foreground">Finanzas</p>
      <ui-skeleton shape="pill" width="100%" class="mt-6" />
      @for (item of navPlaceholders; track item) {
        <ui-skeleton width="70%" class="mt-3" />
      }
    </aside>
    <div
      class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)]"
      aria-hidden="true"
    >
      <ui-skeleton shape="title" />
      <div class="glass flex flex-col gap-3 rounded-card p-4">
        <ui-skeleton width="40%" />
        <ui-skeleton shape="amount" />
      </div>
      @for (card of cardPlaceholders; track card) {
        <div class="glass flex flex-col gap-3 rounded-card p-4">
          <ui-skeleton width="50%" />
          <ui-skeleton [lines]="2" />
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BootSplash {
  protected readonly navPlaceholders = [0, 1, 2, 3];
  protected readonly cardPlaceholders = [0, 1];
}
