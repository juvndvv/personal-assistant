import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  signal,
} from '@angular/core';
import { visibleLabelIndexes } from './chart-geometry';
import { ChartDataTable, ChartLegend, ChartTooltip, LegendItem, TooltipRow } from './chart-parts';
import { linearScale, niceDomain } from './chart-scale';
import { ChartCategory, ChartSeries, ValueFormatter, seriesColor } from './chart-types';
import { observeChartWidth } from './chart-width';

const MARGIN = { top: 12, right: 16, bottom: 24, left: 48 };
const MIN_LABEL_SPACING = 56;

interface LinePoint {
  x: number;
  y: number;
}

interface LineMark {
  key: string;
  label: string;
  color: string;
  path: string;
  end: LinePoint | null;
  endLabel: string | null;
}

@Component({
  selector: 'app-line-chart',
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
                class="fill-muted-foreground text-xs tabular-nums"
              >
                {{ tick.label }}
              </text>
            }
            @if (active() !== null) {
              <line
                [attr.x1]="pointX(active() ?? 0)"
                [attr.x2]="pointX(active() ?? 0)"
                [attr.y1]="margin.top"
                [attr.y2]="margin.top + height()"
                stroke-width="1"
                style="stroke: var(--viz-axis)"
                data-testid="crosshair"
              />
            }
            @for (line of lines(); track line.key) {
              <path
                [attr.d]="line.path"
                fill="none"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
                [style.stroke]="line.color"
                data-testid="line"
              />
              @if (line.end; as end) {
                <circle
                  [attr.cx]="end.x"
                  [attr.cy]="end.y"
                  r="4"
                  stroke-width="2"
                  [style.fill]="line.color"
                  style="stroke: var(--viz-surface)"
                />
                @if (line.endLabel) {
                  <text
                    [attr.x]="end.x"
                    [attr.y]="end.y - 10"
                    text-anchor="end"
                    class="fill-foreground text-xs font-semibold tabular-nums"
                    data-testid="end-label"
                  >
                    {{ line.endLabel }}
                  </text>
                }
              }
            }
            @for (index of labelIndexes(); track index) {
              <text
                [attr.x]="pointX(index)"
                [attr.y]="totalHeight() - 6"
                text-anchor="middle"
                class="fill-muted-foreground text-xs"
              >
                {{ categories()[index]?.label }}
              </text>
            }
          </g>
          @for (category of categories(); track category.key; let index = $index) {
            <rect
              [attr.x]="pointX(index) - stepWidth() / 2"
              [attr.y]="margin.top"
              [attr.width]="stepWidth()"
              [attr.height]="height()"
              fill="transparent"
              tabindex="0"
              role="img"
              class="outline-none"
              [attr.aria-label]="describe(index)"
              (pointerenter)="active.set(index)"
              (pointerleave)="active.set(null)"
              (focus)="active.set(index)"
              (blur)="active.set(null)"
            />
          }
        </svg>
        @if (active() !== null) {
          <app-chart-tooltip
            [heading]="headingAt(active() ?? 0)"
            [rows]="rowsAt(active() ?? 0)"
            [x]="pointX(active() ?? 0)"
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
export class LineChart {
  readonly categories = input.required<readonly ChartCategory[]>();
  readonly series = input.required<readonly ChartSeries[]>();
  readonly ariaLabel = input.required<string>();
  readonly rowHeader = input('Periodo');
  readonly height = input(160);
  readonly busy = input(false, { transform: booleanAttribute });
  readonly valueFormatter = input.required<ValueFormatter>();
  readonly axisFormatter = input<ValueFormatter | null>(null);

  protected readonly margin = MARGIN;
  protected readonly width = observeChartWidth();
  protected readonly active = signal<number | null>(null);

  protected readonly totalHeight = computed(() => this.height() + MARGIN.top + MARGIN.bottom);
  private readonly plotWidth = computed(() =>
    Math.max(1, this.width() - MARGIN.left - MARGIN.right),
  );
  protected readonly stepWidth = computed(
    () => this.plotWidth() / Math.max(1, this.categories().length),
  );

  private readonly domain = computed(() =>
    niceDomain(this.series().flatMap((series) => series.values)),
  );
  private readonly y = computed(() =>
    linearScale(this.domain(), MARGIN.top + this.height(), MARGIN.top),
  );

  protected readonly ticks = computed(() => {
    const format = this.axisFormatter() ?? this.valueFormatter();
    return this.domain().ticks.map((value) => ({
      value,
      y: this.y()(value),
      label: format(value),
    }));
  });

  protected readonly lines = computed<LineMark[]>(() => {
    const y = this.y();
    const single = this.series().length === 1;
    return this.series().map((entry) => {
      const segments: string[] = [];
      let drawing = false;
      let end: LinePoint | null = null;
      let endValue: number | null = null;
      for (const [index, value] of entry.values.entries()) {
        if (value === null) {
          drawing = false;
          continue;
        }
        const point = { x: round(this.pointX(index)), y: round(y(value)) };
        segments.push(`${drawing ? 'L' : 'M'}${point.x},${point.y}`);
        drawing = true;
        end = point;
        endValue = value;
      }
      return {
        key: entry.key,
        label: entry.label,
        color: seriesColor(entry.slot),
        path: segments.join(' '),
        end,
        endLabel: single && endValue !== null ? this.valueFormatter()(endValue) : null,
      };
    });
  });

  protected readonly legend = computed<LegendItem[]>(() =>
    this.series().map((entry) => ({ label: entry.label, slot: entry.slot, mark: 'line' })),
  );

  protected readonly labelIndexes = computed(() =>
    visibleLabelIndexes(this.categories().length, Math.floor(this.plotWidth() / MIN_LABEL_SPACING)),
  );

  protected readonly tableRows = computed(() =>
    this.categories().map((category) => category.description ?? category.label),
  );
  protected readonly tableColumns = computed(() =>
    this.series().map((entry) => ({
      label: entry.label,
      values: this.categories().map((_, index) => this.formatValue(entry.values[index])),
    })),
  );

  protected pointX(index: number): number {
    return MARGIN.left + (index + 0.5) * this.stepWidth();
  }

  protected describe(index: number): string {
    const values = this.rowsAt(index)
      .map((row) => `${row.label} ${row.value}`)
      .join(', ');
    return `${this.headingAt(index)}: ${values}`;
  }

  protected headingAt(index: number): string {
    const category = this.categories()[index];
    return category?.description ?? category?.label ?? '';
  }

  protected rowsAt(index: number): TooltipRow[] {
    return this.series().map((entry) => ({
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
