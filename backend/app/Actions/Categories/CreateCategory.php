<?php

declare(strict_types=1);

namespace App\Actions\Categories;

use App\Domain\Categories\CategoryParentGuard;
use App\Models\Category;
use Illuminate\Support\Facades\DB;

final readonly class CreateCategory
{
    public function __construct(private CategoryParentGuard $parentGuard) {}

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function handle(array $attributes): Category
    {
        return DB::transaction(function () use ($attributes): Category {
            $category = new Category;
            $category->fill($attributes);

            if ($category->parent_id !== null) {
                $this->parentGuard->ensureValidParent($category, $category->parent_id);
            }

            $category->save();

            return $category->refresh()->load('children');
        });
    }
}
