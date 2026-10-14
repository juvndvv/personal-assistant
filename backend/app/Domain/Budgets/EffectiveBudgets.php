<?php

declare(strict_types=1);

namespace App\Domain\Budgets;

use App\Domain\Period\Period;
use App\Enums\CategoryKind;
use App\Models\Budget;
use App\Models\Category;

final class EffectiveBudgets
{
    /**
     * @return list<EffectiveBudget>
     */
    public function forPeriod(Period $period): array
    {
        $latest = Budget::query()
            ->select(['amount_cents', 'effective_from'])
            ->whereColumn('budgets.category_id', 'categories.id')
            ->where('effective_from', '<=', $period->label)
            ->orderByDesc('effective_from')
            ->limit(1);

        $categories = Category::query()
            ->select('categories.*')
            ->addSelect(['budgets.amount_cents AS budget_amount_cents', 'budgets.effective_from AS budget_effective_from'])
            ->leftJoinLateral($latest, 'budgets')
            ->where('categories.kind', CategoryKind::Expense->value)
            ->whereNull('categories.parent_id')
            ->whereNull('categories.archived_at')
            ->orderBy('categories.sort_order')
            ->orderByRaw('lower(categories.name)')
            ->orderBy('categories.id')
            ->get();

        $budgets = [];

        foreach ($categories as $category) {
            $amountCents = $category->getAttribute('budget_amount_cents');
            $effectiveFrom = $category->getAttribute('budget_effective_from');
            $budgeted = is_numeric($amountCents) && (int) $amountCents > 0 && is_string($effectiveFrom);

            $category->offsetUnset('budget_amount_cents');
            $category->offsetUnset('budget_effective_from');
            $category->setRelation('parent', null);

            $budgets[] = new EffectiveBudget(
                category: $category,
                amountCents: $budgeted ? (int) $amountCents : null,
                effectiveFrom: $budgeted ? $effectiveFrom : null,
            );
        }

        return $budgets;
    }

    /**
     * @return list<EffectiveBudget>
     */
    public function budgetedIn(Period $period): array
    {
        return array_values(array_filter(
            $this->forPeriod($period),
            fn (EffectiveBudget $budget): bool => $budget->isBudgeted(),
        ));
    }
}
