<?php

declare(strict_types=1);

namespace App\Domain\Transactions;

use Carbon\CarbonImmutable;

final readonly class QuickAddDefaultValues
{
    /**
     * @param  list<int>  $frequentExpenseCategoryIds
     * @param  list<int>  $frequentIncomeCategoryIds
     */
    public function __construct(
        public CarbonImmutable $date,
        public ?int $accountId,
        public array $frequentExpenseCategoryIds,
        public array $frequentIncomeCategoryIds,
    ) {}
}
