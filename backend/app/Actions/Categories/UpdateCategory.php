<?php

declare(strict_types=1);

namespace App\Actions\Categories;

use App\Domain\Categories\CategoryParentGuard;
use App\Models\Category;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

final readonly class UpdateCategory
{
    public function __construct(private CategoryParentGuard $parentGuard) {}

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function handle(Category $category, array $attributes): Category
    {
        return DB::transaction(function () use ($category, $attributes): Category {
            $category->fill(Arr::except($attributes, ['kind', 'archived_at']));

            if ($category->isDirty('parent_id') && $category->parent_id !== null) {
                $this->parentGuard->ensureValidParent($category, $category->parent_id);
            }

            $category->save();

            return $category->load(['children' => fn ($query) => $query->ordered()]);
        });
    }
}
