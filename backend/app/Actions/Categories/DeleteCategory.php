<?php

declare(strict_types=1);

namespace App\Actions\Categories;

use App\Exceptions\DomainConflict;
use App\Models\Category;
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

            if ($category->transactions()->withTrashed()->exists()) {
                throw new DomainConflict(
                    'category_in_use',
                    'La categoría está en uso. Archívala en su lugar.',
                );
            }

            $category->delete();
        });
    }
}
