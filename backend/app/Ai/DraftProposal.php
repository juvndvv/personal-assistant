<?php

declare(strict_types=1);

namespace App\Ai;

final readonly class DraftProposal
{
    /**
     * @param  array{type: string|null, amount_cents: int|null, date: string|null, account_id: int|null, to_account_id: int|null, category_id: int|null, description: string|null, merchant: string|null}  $values
     * @param  array<string, float>  $confidence
     * @param  array<string, string>  $fieldSources
     * @param  list<string>  $lowConfidenceFields
     */
    public function __construct(
        public array $values,
        public array $confidence,
        public array $fieldSources,
        public array $lowConfidenceFields,
    ) {}
}
