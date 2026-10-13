<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Domain\Cards\CardSettlementSuggestion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property CardSettlementSuggestion $resource
 */
final class CardSettlementSuggestionResource extends JsonResource
{
    public function __construct(CardSettlementSuggestion $suggestion)
    {
        parent::__construct($suggestion);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $suggestion = $this->resource;

        return [
            'card_account_id' => $suggestion->cardAccountId,
            'statement_start' => $suggestion->statementStart?->toDateString(),
            'statement_end' => $suggestion->statementEnd?->toDateString(),
            'statement_balance_cents' => $suggestion->statementBalanceCents,
            'settled_since_cents' => $suggestion->settledSinceCents,
            'suggested_cents' => $suggestion->suggestedCents,
            'from_account_id' => $suggestion->fromAccountId,
        ];
    }
}
