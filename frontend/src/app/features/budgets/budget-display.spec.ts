import { formatCents } from '../../core/money/format-cents';
import {
  BUDGET_STATUS_LABELS,
  BUDGET_STATUS_TONES,
  budgetAmountLabel,
  remainingLabel,
  topBudgetsByUsage,
} from './budget-display';
import { aBudgetItem, aBudgetVsActual, aCategorySummary } from './testing/budget-fixtures';

const plain = (text: string) => text.replace(/\s+/g, ' ');

describe('budget display', () => {
  it('maps every status to its progress colour and label', () => {
    expect(BUDGET_STATUS_TONES).toEqual({ ok: 'ok', warning: 'warning', over: 'over' });
    expect(BUDGET_STATUS_LABELS).toEqual({
      ok: 'En presupuesto',
      warning: 'Cerca del límite',
      over: 'Superado',
    });
  });

  it('describes what is left or how much the budget was exceeded', () => {
    expect(plain(remainingLabel(aBudgetItem({ remaining_cents: 9000 })))).toBe(
      plain(`Quedan ${formatCents(9000)}`),
    );
    expect(plain(remainingLabel(aBudgetItem({ remaining_cents: 0 })))).toBe(
      plain(`Quedan ${formatCents(0)}`),
    );
    expect(plain(remainingLabel(aBudgetItem({ remaining_cents: -2000 })))).toBe(
      plain(`Te has pasado ${formatCents(2000)}`),
    );
  });

  it('treats a zero or missing amount as no budget', () => {
    expect(budgetAmountLabel(null)).toBe('Sin presupuesto');
    expect(budgetAmountLabel(0)).toBe('Sin presupuesto');
    expect(plain(budgetAmountLabel(40000))).toBe(plain(formatCents(40000)));
  });

  it('picks the most used budgets first, breaking ties by name', () => {
    const items = [
      ...aBudgetVsActual().items,
      aBudgetItem({ category: aCategorySummary({ id: 50, name: 'Bares' }), used_bp: 4900 }),
    ];

    expect(topBudgetsByUsage(items, 3).map((item) => item.category.name)).toEqual([
      'Alimentación',
      'Vivienda',
      'Bares',
    ]);
    expect(topBudgetsByUsage([], 3)).toEqual([]);
  });
});
