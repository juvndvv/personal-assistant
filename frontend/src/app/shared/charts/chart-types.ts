export type SeriesSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ChartCategory {
  key: string;
  label: string;
  description?: string;
}

export interface ChartSeries {
  key: string;
  label: string;
  slot: SeriesSlot;
  values: readonly (number | null)[];
}

export type ValueFormatter = (value: number) => string;

export function seriesColor(slot: SeriesSlot | null): string {
  return slot === null ? 'var(--viz-other)' : `var(--viz-series-${slot})`;
}
