<?php

declare(strict_types=1);

namespace App\Domain\Budgets;

use App\Models\Category;

final readonly class EffectiveBudget
{
    public function __construct(
        public Category $category,
        public ?int $amountCents,
        public ?string $effectiveFrom,
    ) {}

    public function isBudgeted(): bool
    {
        return $this->amountCents !== null;
    }
}
