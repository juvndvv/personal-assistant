import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SeriesSlot, seriesColor } from './chart-types';

export type LegendMark = 'rect' | 'line';

export interface LegendItem {
  label: string;
  slot: SeriesSlot | null;
  mark: LegendMark;
}

export interface TooltipRow {
  label: string;
  value: string;
  slot: SeriesSlot | null;
}

export interface DataTableColumn {
  label: string;
  values: readonly string[];
}

const TOOLTIP_HALF_WIDTH = 80;

@Component({
  selector: 'app-chart-legend',
  template: `
    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Leyenda">
      @for (item of items(); track item.label) {
        <li class="flex items-center gap-1.5">
          @if (item.mark === 'line') {
            <span class="h-0.5 w-3 rounded-full" [style.background]="color(item.slot)"></span>
          } @else {
            <span class="size-2.5 rounded-xs" [style.background]="color(item.slot)"></span>
          }
          {{ item.label }}
        </li>
      }
    </ul>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartLegend {
  readonly items = input.required<readonly LegendItem[]>();

  protected color(slot: SeriesSlot | null): string {
    return seriesColor(slot);
  }
}

@Component({
  selector: 'app-chart-tooltip',
  template: `
    <div
      role="status"
      class="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md"
      [style.left.px]="left()"
      data-testid="chart-tooltip"
    >
      <p class="mb-1 text-muted-foreground">{{ heading() }}</p>
      @for (row of rows(); track row.label) {
        <p class="flex items-center gap-2">
          <span class="h-0.5 w-3 shrink-0 rounded-full" [style.background]="color(row.slot)"></span>
          <span class="font-semibold tabular-nums text-foreground">{{ row.value }}</span>
          <span class="text-muted-foreground">{{ row.label }}</span>
        </p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartTooltip {
  readonly heading = input.required<string>();
  readonly rows = input.required<readonly TooltipRow[]>();
  readonly x = input.required<number>();
  readonly containerWidth = input.required<number>();

  protected readonly left = computed(() =>
    Math.min(
      Math.max(this.x(), TOOLTIP_HALF_WIDTH),
      Math.max(TOOLTIP_HALF_WIDTH, this.containerWidth() - TOOLTIP_HALF_WIDTH),
    ),
  );

  protected color(slot: SeriesSlot | null): string {
    return seriesColor(slot);
  }
}

@Component({
  selector: 'app-chart-data-table',
  template: `
    <details class="mt-2 text-xs">
      <summary class="cursor-pointer text-muted-foreground hover:text-foreground">
        Ver datos en tabla
      </summary>
      <div class="mt-2 overflow-x-auto">
        <table class="w-full text-left">
          <caption class="sr-only">
            {{
              caption()
            }}
          </caption>
          <thead>
            <tr class="text-muted-foreground">
              <th scope="col" class="py-1 pe-3 font-medium">{{ rowHeader() }}</th>
              @for (column of columns(); track column.label) {
                <th scope="col" class="py-1 pe-3 text-end font-medium">{{ column.label }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track $index; let index = $index) {
              <tr class="border-t border-border">
                <th scope="row" class="py-1 pe-3 font-normal text-foreground">{{ row }}</th>
                @for (column of columns(); track column.label) {
                  <td class="py-1 pe-3 text-end tabular-nums text-foreground">
                    {{ column.values[index] }}
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    </details>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartDataTable {
  readonly caption = input.required<string>();
  readonly rowHeader = input.required<string>();
  readonly rows = input.required<readonly string[]>();
  readonly columns = input.required<readonly DataTableColumn[]>();
}
