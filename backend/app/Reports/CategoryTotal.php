<?php

declare(strict_types=1);

namespace App\Reports;

final readonly class CategoryTotal
{
    /**
     * @param  list<SubcategoryTotal>  $children
     */
    public function __construct(
        public int $categoryId,
        public string $name,
        public int $amountCents,
        public int $shareBp,
        public int $ownCents,
        public array $children,
    ) {}
}
