import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { formatCents } from '../../core/money/format-cents';
import { formatAxisCents } from './chart-format';
import { columnPath, visibleLabelIndexes } from './chart-geometry';
import { ChartDataTable, ChartLegend, ChartTooltip, LegendItem, TooltipRow } from './chart-parts';
import { linearScale, niceDomain } from './chart-scale';
import { ChartCategory, ChartSeries, ValueFormatter, seriesColor } from './chart-types';
import { observeChartWidth } from './chart-width';

const MARGIN = { top: 8, right: 8, bottom: 24, left: 56 };
const MAX_BAR_WIDTH = 24;
const BAR_GAP = 2;
const BAR_RADIUS = 4;
const MIN_LABEL_SPACING = 48;

interface BarMark {
  key: string;
  path: string;
  color: string;
}

interface OverlayPoint {
  x: number;
  y: number;
}

@Component({
  selector: 'app-bar-chart',
  imports: [ChartDataTable, ChartLegend, ChartTooltip],
  template: `
    <figure class="m-0 transition-opacity" [class.opacity-60]="busy()">
      @if (legend().length > 1) {
        <app-chart-legend class="mb-2 block" [items]="legend()" />
      }
      <div class="relative">
        <svg
          [attr.width]="width()"
          [attr.height]="totalHeight()"
          [attr.viewBox]="'0 0 ' + width() + ' ' + totalHeight()"
          role="group"
          [attr.aria-label]="ariaLabel()"
          class="block overflow-visible"
        >
          <g aria-hidden="true">
            @if (selectedX(); as band) {
              <rect
                [attr.x]="band.x"
                [attr.y]="margin.top"
                [attr.width]="band.width"
                [attr.height]="plotHeight()"
                rx="6"
                class="fill-muted"
                data-testid="selected-band"
              />
            }
            @for (tick of ticks(); track tick.value) {
              <line
                [attr.x1]="margin.left"
                [attr.x2]="width() - margin.right"
                [attr.y1]="tick.y"
                [attr.y2]="tick.y"
                stroke-width="1"
                [style.stroke]="tick.value === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'"
              />
              <text
                [attr.x]="margin.left - 6"
                [attr.y]="tick.y"
                text-anchor="end"
                dominant-baseline="middle"
                class="fill-muted-foreground text-[10px] tabular-nums"
              >
                {{ tick.label }}
              </text>
            }
            @for (bar of bars(); track bar.key) {
              <path [attr.d]="bar.path" [style.fill]="bar.color" data-testid="bar" />
            }
            @if (overlayPath(); as path) {
              <path
                [attr.d]="path"
                fill="none"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
                [style.stroke]="overlayColor()"
                data-testid="overlay-line"
              />
              @for (point of overlayPoints(); track $index) {
                <circle
                  [attr.cx]="point.x"
                  [attr.cy]="point.y"
                  r="4"
                  stroke-width="2"
                  [style.fill]="overlayColor()"
                  style="stroke: var(--viz-surface)"
                />
              }
            }
            @for (index of labelIndexes(); track index) {
              <text
                [attr.x]="bandCenter(index)"
                [attr.y]="totalHeight() - 6"
                text-anchor="middle"
                class="fill-muted-foreground text-[10px]"
              >
                {{ categories()[index]?.label }}
              </text>
            }
          </g>
          @for (category of categories(); track category.key; let index = $index) {
            <rect
              [attr.x]="bandStart(index)"
              [attr.y]="margin.top"
              [attr.width]="bandWidth()"
              [attr.height]="plotHeight()"
              fill="transparent"
              tabindex="0"
              class="outline-none focus-visible:stroke-ring"
              [attr.role]="selectable() ? 'button' : 'img'"
              [attr.aria-label]="describe(index)"
              [attr.aria-current]="category.key === selectedKey() ? 'true' : null"
              (pointerenter)="active.set(index)"
              (pointerleave)="active.set(null)"
              (focus)="active.set(index)"
              (blur)="active.set(null)"
              (click)="choose(index)"
              (keydown.enter)="choose(index)"
              (keydown.space)="choose(index); $event.preventDefault()"
            />
          }
        </svg>
        @if (active() !== null) {
          <app-chart-tooltip
            [heading]="tooltipHeading()"
            [rows]="tooltipRows()"
            [x]="bandCenter(active() ?? 0)"
            [containerWidth]="width()"
          />
        }
      </div>
      <app-chart-data-table
        [caption]="ariaLabel()"
        [rowHeader]="rowHeader()"
        [rows]="tableRows()"
        [columns]="tableColumns()"
      />
    </figure>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarChart {
  readonly categories = input.required<readonly ChartCategory[]>();
  readonly series = input.required<readonly ChartSeries[]>();
  readonly overlay = input<ChartSeries | null>(null);
  readonly ariaLabel = input.required<string>();
  readonly rowHeader = input('Periodo');
  readonly height = input(180);
  readonly selectedKey = input<string | null>(null);
  readonly selectable = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  readonly valueFormatter = input<ValueFormatter>((cents) => formatCents(cents));
  readonly axisFormatter = input<ValueFormatter>(formatAxisCents);

  readonly selectCategory = output<string>();

  protected readonly margin = MARGIN;
  protected readonly width = observeChartWidth();
  protected readonly active = signal<number | null>(null);

  protected readonly plotHeight = computed(() => this.height());
  protected readonly totalHeight = computed(() => this.height() + MARGIN.top + MARGIN.bottom);
  protected readonly plotWidth = computed(() =>
    Math.max(1, this.width() - MARGIN.left - MARGIN.right),
  );
  protected readonly bandWidth = computed(
    () => this.plotWidth() / Math.max(1, this.categories().length),
  );

  private readonly domain = computed(() =>
    niceDomain([
      ...this.series().flatMap((series) => series.values),
      ...(this.overlay()?.values ?? []),
    ]),
  );
  private readonly y = computed(() =>
    linearScale(this.domain(), MARGIN.top + this.plotHeight(), MARGIN.top),
  );

  protected readonly ticks = computed(() =>
    this.domain().ticks.map((value) => ({
      value,
      y: this.y()(value),
      label: this.axisFormatter()(value),
    })),
  );

  protected readonly bars = computed<BarMark[]>(() => {
    const series = this.series();
    const count = series.length;
    const groupWidth = this.bandWidth() * 0.7;
    const barWidth = Math.max(
      2,
      Math.min(MAX_BAR_WIDTH, (groupWidth - BAR_GAP * (count - 1)) / Math.max(1, count)),
    );
    const totalWidth = barWidth * count + BAR_GAP * (count - 1);
    const y = this.y();
    const baseline = y(0);
    return this.categories().flatMap((category, index) =>
      series.flatMap((entry, seriesIndex) => {
        const value = entry.values[index];
        if (value === null || value === undefined || value === 0) {
          return [];
        }
        const x = this.bandCenter(index) - totalWidth / 2 + seriesIndex * (barWidth + BAR_GAP);
        return [
          {
            key: `${category.key}-${entry.key}`,
            path: columnPath(
              round(x),
              round(baseline),
              round(y(value)),
              round(barWidth),
              BAR_RADIUS,
            ),
            color: seriesColor(entry.slot),
          },
        ];
      }),
    );
  });

  protected readonly overlayPoints = computed<OverlayPoint[]>(() => {
    const overlay = this.overlay();
    if (overlay === null) {
      return [];
    }
    const y = this.y();
    return this.categories().flatMap((_, index) => {
      const value = overlay.values[index];
      return value === null || value === undefined
        ? []
        : [{ x: round(this.bandCenter(index)), y: round(y(value)) }];
    });
  });

  protected readonly overlayPath = computed(() => {
    const points = this.overlayPoints();
    return points.length === 0
      ? null
      : points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
  });

  protected readonly overlayColor = computed(() => seriesColor(this.overlay()?.slot ?? null));

  protected readonly legend = computed<LegendItem[]>(() => {
    const items: LegendItem[] = this.series().map((entry) => ({
      label: entry.label,
      slot: entry.slot,
      mark: 'rect',
    }));
    const overlay = this.overlay();
    if (overlay !== null) {
      items.push({ label: overlay.label, slot: overlay.slot, mark: 'line' });
    }
    return items;
  });

  protected readonly labelIndexes = computed(() =>
    visibleLabelIndexes(this.categories().length, Math.floor(this.plotWidth() / MIN_LABEL_SPACING)),
  );

  protected readonly selectedX = computed(() => {
    const index = this.categories().findIndex((category) => category.key === this.selectedKey());
    return index < 0 ? null : { x: this.bandStart(index) + 2, width: this.bandWidth() - 4 };
  });

  protected readonly tooltipHeading = computed(() => this.headingAt(this.active() ?? 0));
  protected readonly tooltipRows = computed(() => this.rowsAt(this.active() ?? 0));

  protected readonly tableRows = computed(() =>
    this.categories().map((category) => category.description ?? category.label),
  );
  protected readonly tableColumns = computed(() =>
    this.allSeries().map((entry) => ({
      label: entry.label,
      values: this.categories().map((_, index) => this.formatValue(entry.values[index])),
    })),
  );

  protected bandStart(index: number): number {
    return MARGIN.left + index * this.bandWidth();
  }

  protected bandCenter(index: number): number {
    return this.bandStart(index) + this.bandWidth() / 2;
  }

  protected describe(index: number): string {
    const values = this.rowsAt(index)
      .map((row) => `${row.label} ${row.value}`)
      .join(', ');
    return `${this.headingAt(index)}: ${values}`;
  }

  protected choose(index: number): void {
    const category = this.categories()[index];
    if (this.selectable() && category !== undefined) {
      this.selectCategory.emit(category.key);
    }
  }

  private allSeries(): ChartSeries[] {
    const overlay = this.overlay();
    return overlay === null ? [...this.series()] : [...this.series(), overlay];
  }

  private headingAt(index: number): string {
    const category = this.categories()[index];
    return category?.description ?? category?.label ?? '';
  }

  private rowsAt(index: number): TooltipRow[] {
    return this.allSeries().map((entry) => ({
      label: entry.label,
      value: this.formatValue(entry.values[index]),
      slot: entry.slot,
    }));
  }

  private formatValue(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : this.valueFormatter()(value);
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
