import { Params } from '@angular/router';
import { CategoryKind, Period, PeriodLabel, TrendPoint } from '../../core/api/models';
import { formatDate } from '../../core/date/iso-date';
import { formatPeriodLabel } from '../../core/date/period-label';
import { ChartCategory, StatTone, shortPeriodLabel } from '../../shared/charts';

export const TREND_PERIODS = 12;
export const KIND_QUERY_PARAM = 'kind';
export const CATEGORY_QUERY_PARAM = 'category';

export const CAPTURE_TARGETS = {
  maxMedianSeconds: 10,
  minUneditedShareBp: 8000,
  minActiveDaysPerWeek: 5,
} as const;

export const KIND_LABELS: Record<CategoryKind, string> = {
  expense: 'Gastos',
  income: 'Ingresos',
};

export function periodRange(period: Period): string {
  return `${formatDate(period.start, 'medium')} – ${formatDate(period.end, 'medium')}`;
}

export function periodDescription(period: Period): string {
  return `${formatPeriodLabel(period.label)} (${periodRange(period)})`;
}

export function trendCategories(points: readonly TrendPoint[]): ChartCategory[] {
  return points.map((point) => ({
    key: point.period.label,
    label: shortPeriodLabel(point.period.label),
    description: periodDescription(point.period),
  }));
}

export function savingsTone(savingsRateBp: number | null): StatTone {
  if (savingsRateBp === null || savingsRateBp === 0) {
    return 'neutral';
  }
  return savingsRateBp > 0 ? 'positive' : 'negative';
}

export function signedTone(cents: number): StatTone {
  return cents === 0 ? 'neutral' : cents > 0 ? 'positive' : 'negative';
}

export function movementsQueryParams(period: PeriodLabel, categoryId: number): Params {
  return { period, category: categoryId };
}

export function kindFromParam(value: string | null): CategoryKind {
  return value === 'income' ? 'income' : 'expense';
}

export function categoryIdFromParam(value: string | null): number | null {
  return value !== null && /^[1-9]\d*$/.test(value) ? Number(value) : null;
}
