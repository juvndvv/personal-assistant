<?php

declare(strict_types=1);

namespace App\Actions\Budgets;

use App\Models\Budget;
use App\Models\Category;
use Illuminate\Support\Facades\DB;

final class ClearBudget
{
    public function handle(Category $category): void
    {
        DB::transaction(function () use ($category): void {
            Category::query()->lockForUpdate()->findOrFail($category->id);

            Budget::query()->where('category_id', $category->id)->delete();
        });
    }
}
