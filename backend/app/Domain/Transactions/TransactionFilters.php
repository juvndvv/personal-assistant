<?php

declare(strict_types=1);

namespace App\Domain\Transactions;

use App\Enums\TransactionOrigin;
use App\Enums\TransactionType;
use Carbon\CarbonImmutable;

final readonly class TransactionFilters
{
    /**
     * @param  list<TransactionType>  $types
     * @param  list<int>  $accountIds
     * @param  list<int>  $categoryIds
     * @param  list<int>  $tagIds
     * @param  list<TransactionOrigin>  $origins
     */
    public function __construct(
        public ?string $search = null,
        public array $types = [],
        public array $accountIds = [],
        public array $categoryIds = [],
        public array $tagIds = [],
        public TagMatch $tagMatch = TagMatch::Any,
        public array $origins = [],
        public ?CarbonImmutable $dateFrom = null,
        public ?CarbonImmutable $dateTo = null,
        public ?int $amountMinCents = null,
        public ?int $amountMaxCents = null,
        public ?bool $hasAttachments = null,
        public TransactionSort $sort = TransactionSort::DateDesc,
    ) {}
}
