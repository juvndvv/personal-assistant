<?php

declare(strict_types=1);

namespace App\Reports;

final readonly class SubcategoryTotal
{
    public function __construct(
        public int $categoryId,
        public string $name,
        public int $amountCents,
        public int $shareBp,
    ) {}
}
