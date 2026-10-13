<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Domain\Transactions\QuickAddDefaultValues;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property QuickAddDefaultValues $resource
 */
final class QuickAddDefaultsResource extends JsonResource
{
    public function __construct(QuickAddDefaultValues $defaults)
    {
        parent::__construct($defaults);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'date' => $this->resource->date->toDateString(),
            'account_id' => $this->resource->accountId,
            'frequent_category_ids' => [
                'expense' => $this->resource->frequentExpenseCategoryIds,
                'income' => $this->resource->frequentIncomeCategoryIds,
            ],
        ];
    }
}
