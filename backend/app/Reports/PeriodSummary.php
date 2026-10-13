<?php

declare(strict_types=1);

namespace App\Reports;

use App\Domain\Period\Period;

final readonly class PeriodSummary
{
    /**
     * @param  list<CategoryTotal>  $expenseCategories
     * @param  list<CategoryTotal>  $incomeCategories
     */
    public function __construct(
        public Period $period,
        public int $incomeCents,
        public int $expenseCents,
        public array $expenseCategories,
        public array $incomeCategories,
    ) {}

    public function netCents(): int
    {
        return $this->incomeCents - $this->expenseCents;
    }

    public function savingsRateBp(): ?int
    {
        return BasisPoints::ratio($this->netCents(), $this->incomeCents);
    }
}
