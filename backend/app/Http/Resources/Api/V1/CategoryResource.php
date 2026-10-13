<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property Category $resource
 */
final class CategoryResource extends JsonResource
{
    public function __construct(Category $category)
    {
        parent::__construct($category);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $category = $this->resource;

        return [
            'id' => $category->id,
            'kind' => $category->kind->value,
            'name' => $category->name,
            'parent_id' => $category->parent_id,
            'icon' => $category->icon,
            'color' => $category->color,
            'sort_order' => $category->sort_order,
            'archived_at' => $category->archived_at?->toIso8601String(),
            'children' => $category->relationLoaded('children')
                ? $category->children->map(fn (Category $child): self => new self($child))->all()
                : [],
        ];
    }
}
