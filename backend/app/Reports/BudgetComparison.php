<?php

declare(strict_types=1);

namespace App\Reports;

use App\Models\Category;

final readonly class BudgetComparison
{
    public function __construct(
        public Category $category,
        public int $budgetCents,
        public int $actualCents,
    ) {}

    public function remainingCents(): int
    {
        return $this->budgetCents - $this->actualCents;
    }

    public function usedBp(): int
    {
        return BasisPoints::ratio($this->actualCents, $this->budgetCents) ?? 0;
    }

    public function status(): BudgetStatus
    {
        return BudgetStatus::of($this->actualCents, $this->budgetCents);
    }
}
