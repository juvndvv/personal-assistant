<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Domain\Suggestions\CategorizationSuggestion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property CategorizationSuggestion $resource
 */
final class CategorizationSuggestionResource extends JsonResource
{
    public function __construct(CategorizationSuggestion $suggestion)
    {
        parent::__construct($suggestion);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'category_id' => $this->resource->categoryId,
            'account_id' => $this->resource->accountId,
            'source' => CategorizationSuggestion::SOURCE,
            'hits' => $this->resource->hits,
        ];
    }
}
