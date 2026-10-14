<?php

declare(strict_types=1);

namespace App\Reports;

use App\Domain\Period\Period;

final readonly class BudgetVsActual
{
    /**
     * @param  list<BudgetComparison>  $items
     */
    public function __construct(
        public Period $period,
        public array $items,
        public int $expenseCents,
    ) {}

    public function budgetedCents(): int
    {
        return array_sum(array_map(fn (BudgetComparison $item): int => $item->budgetCents, $this->items));
    }

    public function actualBudgetedCents(): int
    {
        return array_sum(array_map(fn (BudgetComparison $item): int => $item->actualCents, $this->items));
    }

    public function unbudgetedActualCents(): int
    {
        return $this->expenseCents - $this->actualBudgetedCents();
    }
}
