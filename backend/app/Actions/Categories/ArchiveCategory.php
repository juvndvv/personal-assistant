<?php

declare(strict_types=1);

namespace App\Actions\Categories;

use App\Models\Category;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class ArchiveCategory
{
    public function handle(Category $category): Category
    {
        return DB::transaction(function () use ($category): Category {
            if (! $category->isArchived()) {
                $category->archived_at = CarbonImmutable::now();
                $category->save();
            }

            return $category;
        });
    }
}
