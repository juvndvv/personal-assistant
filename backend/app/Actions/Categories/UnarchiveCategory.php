<?php

declare(strict_types=1);

namespace App\Actions\Categories;

use App\Models\Category;
use Illuminate\Support\Facades\DB;

final class UnarchiveCategory
{
    public function handle(Category $category): Category
    {
        return DB::transaction(function () use ($category): Category {
            $category->archived_at = null;
            $category->save();

            return $category;
        });
    }
}
