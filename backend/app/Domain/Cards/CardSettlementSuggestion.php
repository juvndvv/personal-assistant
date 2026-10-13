<?php

declare(strict_types=1);

namespace App\Domain\Cards;

use Carbon\CarbonImmutable;

final readonly class CardSettlementSuggestion
{
    public function __construct(
        public int $cardAccountId,
        public ?CarbonImmutable $statementStart,
        public ?CarbonImmutable $statementEnd,
        public int $statementBalanceCents,
        public int $settledSinceCents,
        public int $suggestedCents,
        public ?int $fromAccountId,
    ) {}
}
