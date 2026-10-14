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

    public function withHistory(int $categoryId, ?int $accountId, float $confidence): self
    {
        $values = $this->values;
        $confidenceByField = $this->confidence;
        $fieldSources = $this->fieldSources;
        $learned = ['category_id' => $categoryId];

        if ($accountId !== null) {
            $learned['account_id'] = $accountId;
        }

        foreach ($learned as $field => $value) {
            $values[$field] = $value;
            $confidenceByField[$field] = $confidence;
            $fieldSources[$field] = SanitizeExtraction::SOURCE_HISTORY;
        }

        return new self(
            values: $values,
            confidence: $confidenceByField,
            fieldSources: $fieldSources,
            lowConfidenceFields: array_values(array_diff($this->lowConfidenceFields, array_keys($learned))),
        );
    }
}
