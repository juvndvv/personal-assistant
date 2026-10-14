<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Domain\Budgets\EffectiveBudget;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property EffectiveBudget $resource
 */
final class BudgetResource extends JsonResource
{
    public function __construct(EffectiveBudget $budget)
    {
        parent::__construct($budget);
    }

    /**
     * @return array{category: array{id: int, name: string, kind: string, parent_id: int|null, parent_name: string|null}, amount_cents: int|null, effective_from: string|null}
     */
    public function toArray(Request $request): array
    {
        return [
            'category' => (new CategorySummaryResource($this->resource->category))->toArray($request),
            'amount_cents' => $this->resource->amountCents,
            'effective_from' => $this->resource->effectiveFrom,
        ];
    }
}
