import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  numberAttribute,
} from '@angular/core';

export type UiSkeletonShape = 'text' | 'title' | 'amount' | 'circle' | 'block' | 'pill';

const SHAPE_CLASS: Record<UiSkeletonShape, string> = {
  text: 'h-3.5 w-full rounded-full',
  title: 'h-5 w-1/2 rounded-full',
  amount: 'h-7 w-28 rounded-full',
  circle: 'size-10 rounded-full',
  block: 'h-24 w-full rounded-card',
  pill: 'h-9 w-24 rounded-capsule',
};

@Component({
  selector: 'ui-skeleton',
  host: { class: 'block', 'aria-hidden': 'true' },
  template: `
    @for (line of lineIndexes(); track line; let last = $last) {
      <span
        data-testid="skeleton-bone"
        class="block bg-muted motion-safe:animate-pulse dark:bg-fill-strong"
        [class]="shapeClass()"
        [class.mt-2]="line > 0"
        [style.width]="last && lines() > 1 ? '60%' : (width() ?? null)"
        [style.height]="height() ?? null"
      ></span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSkeleton {
  readonly shape = input<UiSkeletonShape>('text');
  readonly lines = input(1, { transform: numberAttribute });
  readonly width = input<string>();
  readonly height = input<string>();

  protected readonly shapeClass = computed(() => SHAPE_CLASS[this.shape()]);
  protected readonly lineIndexes = computed(() =>
    Array.from({ length: Math.max(1, this.lines()) }, (_, index) => index),
  );
}

@Component({
  selector: 'ui-skeleton-list',
  imports: [UiSkeleton],
  host: { class: 'block' },
  template: `
    <div role="status" aria-live="polite">
      <span class="sr-only">{{ label() }}</span>
      <ul class="divide-y divide-border" aria-hidden="true">
        @for (row of rowIndexes(); track row) {
          <li class="flex items-center gap-3 px-4 py-3">
            <ui-skeleton shape="circle" />
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <ui-skeleton width="55%" />
              <ui-skeleton width="35%" />
            </div>
            <ui-skeleton width="4.5rem" height="1.125rem" />
          </li>
        }
      </ul>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSkeletonList {
  readonly label = input('Cargando…');
  readonly rows = input(4, { transform: numberAttribute });

  protected readonly rowIndexes = computed(() =>
    Array.from({ length: Math.max(1, this.rows()) }, (_, index) => index),
  );
}
