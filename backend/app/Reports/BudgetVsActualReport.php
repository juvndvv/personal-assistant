<?php

declare(strict_types=1);

namespace App\Reports;

use App\Domain\Budgets\EffectiveBudget;
use App\Domain\Budgets\EffectiveBudgets;
use App\Domain\Period\Period;
use App\Enums\TransactionType;
use App\Models\Category;
use App\Models\Transaction;

final readonly class BudgetVsActualReport
{
    public function __construct(private EffectiveBudgets $budgets) {}

    public function forPeriod(Period $period): BudgetVsActual
    {
        $spendByTopLevel = $this->expenseByTopLevelCategory($period);

        $items = array_map(
            fn (EffectiveBudget $budget): BudgetComparison => new BudgetComparison(
                category: $budget->category,
                budgetCents: (int) $budget->amountCents,
                actualCents: $spendByTopLevel[$budget->category->id] ?? 0,
            ),
            $this->budgets->budgetedIn($period),
        );

        return new BudgetVsActual($period, $items, array_sum($spendByTopLevel));
    }

    /**
     * @return array<int, int>
     */
    private function expenseByTopLevelCategory(Period $period): array
    {
        $rows = Transaction::reportable()
            ->where('type', TransactionType::Expense->value)
            ->whereBetween('date', [$period->start->toDateString(), $period->end->toDateString()])
            ->toBase()
            ->select('category_id')
            ->selectRaw('SUM(ABS(amount_cents)) AS amount_cents')
            ->groupBy('category_id')
            ->get();

        $amountsByCategory = [];

        foreach ($rows as $row) {
            if (is_numeric($row->category_id) && is_numeric($row->amount_cents)) {
                $amountsByCategory[(int) $row->category_id] = (int) $row->amount_cents;
            }
        }

        $parents = Category::query()
            ->whereIn('id', array_keys($amountsByCategory))
            ->pluck('parent_id', 'id');

        $spend = [];

        foreach ($amountsByCategory as $categoryId => $amountCents) {
            $parentId = $parents->get($categoryId);
            $topLevelId = is_numeric($parentId) ? (int) $parentId : $categoryId;
            $spend[$topLevelId] = ($spend[$topLevelId] ?? 0) + $amountCents;
        }

        return $spend;
    }
}
