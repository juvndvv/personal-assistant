<?php

declare(strict_types=1);

namespace App\Actions\Categories;

use App\Exceptions\DomainConflict;
use App\Models\Category;
use App\Models\Draft;
use App\Models\RecurringTemplate;
use Illuminate\Support\Facades\DB;

final class DeleteCategory
{
    public function handle(Category $category): void
    {
        DB::transaction(function () use ($category): void {
            if ($category->children()->exists()) {
                throw new DomainConflict(
                    'category_has_children',
                    'La categoría tiene subcategorías. Elimínalas o muévelas antes.',
                );
            }

            if ($this->isInUse($category)) {
                throw new DomainConflict(
                    'category_in_use',
                    'La categoría está en uso. Archívala en su lugar.',
                );
            }

            $category->delete();
        });
    }

    private function isInUse(Category $category): bool
    {
        return $category->transactions()->withTrashed()->exists()
            || Draft::query()->pending()->where('category_id', $category->id)->exists()
            || RecurringTemplate::withTrashed()->where('category_id', $category->id)->exists();
    }
}
