import { BudgetStatus, BudgetVsActualItem } from '../../core/api/models';
import { formatCents } from '../../core/money/format-cents';
import { ProgressTone } from '../../shared/charts';

export const BUDGETS_PATH = '/mas/presupuestos';
export const HOME_BUDGETS_SHOWN = 3;
export const BUDGET_PERIODS_AHEAD = 12;

export const BUDGET_STATUS_TONES: Record<BudgetStatus, ProgressTone> = {
  ok: 'ok',
  warning: 'warning',
  over: 'over',
};

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  ok: 'En presupuesto',
  warning: 'Cerca del límite',
  over: 'Superado',
};

export function remainingLabel(item: Pick<BudgetVsActualItem, 'remaining_cents'>): string {
  return item.remaining_cents < 0
    ? `Te has pasado ${formatCents(-item.remaining_cents)}`
    : `Quedan ${formatCents(item.remaining_cents)}`;
}

export function hasBudget(amountCents: number | null): amountCents is number {
  return amountCents !== null && amountCents > 0;
}

export function budgetAmountLabel(amountCents: number | null): string {
  return hasBudget(amountCents) ? formatCents(amountCents) : 'Sin presupuesto';
}

export function topBudgetsByUsage(
  items: readonly BudgetVsActualItem[],
  count: number,
): BudgetVsActualItem[] {
  return [...items]
    .sort(
      (left, right) =>
        right.used_bp - left.used_bp || left.category.name.localeCompare(right.category.name, 'es'),
    )
    .slice(0, count);
}
