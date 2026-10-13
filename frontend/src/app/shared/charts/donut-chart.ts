import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { formatCents } from '../../core/money/format-cents';
import { formatBasisPoints } from './chart-format';
import { DonutSegment, arcPath } from './chart-geometry';
import { ValueFormatter, seriesColor } from './chart-types';

const FULL_TURN = Math.PI * 2;
const ALMOST_FULL_TURN = FULL_TURN - 0.0001;
const RING_RATIO = 0.62;

interface ArcMark {
  key: string;
  label: string;
  path: string;
  color: string;
}

interface LegendRow {
  key: string;
  label: string;
  color: string;
  value: string;
  share: string;
}

@Component({
  selector: 'app-donut-chart',
  template: `
    <figure class="m-0 flex flex-wrap items-center gap-5">
      <div class="relative shrink-0" [style.width.px]="size()" [style.height.px]="size()">
        <svg
          [attr.width]="size()"
          [attr.height]="size()"
          [attr.viewBox]="'0 0 ' + size() + ' ' + size()"
          role="img"
          [attr.aria-label]="ariaLabel()"
        >
          @for (arc of arcs(); track arc.key) {
            <path
              [attr.d]="arc.path"
              [style.fill]="arc.color"
              stroke-width="2"
              style="stroke: var(--viz-surface)"
              [attr.opacity]="active() === null || active() === arc.key ? 1 : 0.45"
              (pointerenter)="active.set(arc.key)"
              (pointerleave)="active.set(null)"
              data-testid="donut-arc"
            />
          }
        </svg>
        <div
          class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
        >
          <span class="text-xs text-muted-foreground">{{ activeLabel() }}</span>
          <span class="text-sm font-semibold text-foreground">{{ activeValue() }}</span>
        </div>
      </div>
      <ul class="flex min-w-40 flex-1 flex-col gap-1.5 text-sm" [attr.aria-label]="ariaLabel()">
        @for (row of legend(); track row.key) {
          <li
            class="flex items-center gap-2"
            (pointerenter)="active.set(row.key)"
            (pointerleave)="active.set(null)"
            data-testid="donut-legend-row"
          >
            <span class="size-2.5 shrink-0 rounded-xs" [style.background]="row.color"></span>
            <span class="min-w-0 flex-1 truncate text-foreground">{{ row.label }}</span>
            <span class="tabular-nums text-foreground">{{ row.value }}</span>
            <span class="w-14 text-end tabular-nums text-muted-foreground">{{ row.share }}</span>
          </li>
        }
      </ul>
    </figure>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonutChart {
  readonly segments = input.required<readonly DonutSegment[]>();
  readonly ariaLabel = input.required<string>();
  readonly totalLabel = input('Total');
  readonly size = input(148);
  readonly valueFormatter = input<ValueFormatter>((cents) => formatCents(cents));

  protected readonly active = signal<string | null>(null);

  private readonly total = computed(() =>
    this.segments().reduce((sum, segment) => sum + Math.max(0, segment.value), 0),
  );

  protected readonly arcs = computed<ArcMark[]>(() => {
    const total = this.total();
    if (total === 0) {
      return [];
    }
    const center = this.size() / 2;
    const outer = center - 1;
    const inner = outer * RING_RATIO;
    let angle = 0;
    return this.segments()
      .filter((segment) => segment.value > 0)
      .map((segment) => {
        const sweep = Math.min(ALMOST_FULL_TURN, (segment.value / total) * FULL_TURN);
        const path = arcPath(center, center, outer, inner, angle, angle + sweep);
        angle += sweep;
        return { key: segment.key, label: segment.label, path, color: seriesColor(segment.slot) };
      });
  });

  protected readonly legend = computed<LegendRow[]>(() => {
    const total = this.total();
    return this.segments().map((segment) => ({
      key: segment.key,
      label: segment.label,
      color: seriesColor(segment.slot),
      value: this.valueFormatter()(segment.value),
      share: formatBasisPoints(total === 0 ? 0 : Math.round((segment.value * 10_000) / total)),
    }));
  });

  private readonly activeSegment = computed(
    () => this.segments().find((segment) => segment.key === this.active()) ?? null,
  );
  protected readonly activeLabel = computed(() => this.activeSegment()?.label ?? this.totalLabel());
  protected readonly activeValue = computed(() =>
    this.valueFormatter()(this.activeSegment()?.value ?? this.total()),
  );
}
