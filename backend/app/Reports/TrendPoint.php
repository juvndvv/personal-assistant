<?php

declare(strict_types=1);

namespace App\Reports;

use App\Domain\Period\Period;

final readonly class TrendPoint
{
    public function __construct(
        public Period $period,
        public int $incomeCents,
        public int $expenseCents,
        public ?int $categoryCents,
    ) {}

    public function savingsRateBp(): ?int
    {
        return BasisPoints::ratio($this->incomeCents - $this->expenseCents, $this->incomeCents);
    }
}
