import { of } from 'rxjs';
import {
  Budget,
  BudgetHistoryEntry,
  BudgetVsActual,
  BudgetVsActualItem,
  CategorySummary,
} from '../../../core/api/models';
import { aPeriod } from '../../reports/testing/report-fixtures';

export function aCategorySummary(overrides: Partial<CategorySummary> = {}): CategorySummary {
  return {
    id: 10,
    name: 'Alimentación',
    kind: 'expense',
    parent_id: null,
    parent_name: null,
    ...overrides,
  };
}

export function aBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    category: aCategorySummary(),
    amount_cents: 40000,
    effective_from: '2026-07',
    ...overrides,
  };
}

export function aBudgetList(): Budget[] {
  return [
    aBudget(),
    aBudget({
      category: aCategorySummary({ id: 20, name: 'Vivienda' }),
      amount_cents: 90000,
      effective_from: '2026-10',
    }),
    aBudget({
      category: aCategorySummary({ id: 30, name: 'Ocio' }),
      amount_cents: null,
      effective_from: null,
    }),
  ];
}

export function aBudgetHistory(): BudgetHistoryEntry[] {
  return [
    { effective_from: '2026-11', amount_cents: 0 },
    { effective_from: '2026-09', amount_cents: 45000 },
    { effective_from: '2026-07', amount_cents: 40000 },
  ];
}

export function aBudgetItem(overrides: Partial<BudgetVsActualItem> = {}): BudgetVsActualItem {
  return {
    category: aCategorySummary(),
    budget_cents: 40000,
    actual_cents: 42000,
    remaining_cents: -2000,
    used_bp: 10500,
    status: 'over',
    ...overrides,
  };
}

export function aBudgetVsActual(overrides: Partial<BudgetVsActual> = {}): BudgetVsActual {
  return {
    period: aPeriod(),
    items: [
      aBudgetItem(),
      aBudgetItem({
        category: aCategorySummary({ id: 20, name: 'Vivienda' }),
        budget_cents: 100000,
        actual_cents: 91000,
        remaining_cents: 9000,
        used_bp: 9100,
        status: 'warning',
      }),
      aBudgetItem({
        category: aCategorySummary({ id: 30, name: 'Ocio' }),
        budget_cents: 50000,
        actual_cents: 24500,
        remaining_cents: 25500,
        used_bp: 4900,
        status: 'ok',
      }),
      aBudgetItem({
        category: aCategorySummary({ id: 40, name: 'Transporte' }),
        budget_cents: 10000,
        actual_cents: 0,
        remaining_cents: 10000,
        used_bp: 0,
        status: 'ok',
      }),
    ],
    budgeted_cents: 200000,
    actual_budgeted_cents: 157500,
    unbudgeted_actual_cents: 12000,
    ...overrides,
  };
}

export function anEmptyBudgetVsActual(period = '2026-10'): BudgetVsActual {
  return aBudgetVsActual({
    period: aPeriod(period),
    items: [],
    budgeted_cents: 0,
    actual_budgeted_cents: 0,
    unbudgeted_actual_cents: 157500,
  });
}

export function quietBudgetsApi(budgets: Budget[] = aBudgetList()) {
  return {
    list: () => of(budgets),
    set: () => of(budgets[0] ?? aBudget()),
    history: () => of(aBudgetHistory()),
    clear: () => of(undefined),
  };
}
