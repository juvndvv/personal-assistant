<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property Category $resource
 */
final class CategorySummaryResource extends JsonResource
{
    public function __construct(Category $category)
    {
        parent::__construct($category);
    }

    /**
     * @return array{id: int, name: string, kind: string, parent_id: int|null, parent_name: string|null}
     */
    public function toArray(Request $request): array
    {
        $category = $this->resource;

        return [
            'id' => $category->id,
            'name' => $category->name,
            'kind' => $category->kind->value,
            'parent_id' => $category->parent_id,
            'parent_name' => $category->parent?->name,
        ];
    }
}
