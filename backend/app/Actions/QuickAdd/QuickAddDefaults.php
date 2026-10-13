<?php

declare(strict_types=1);

namespace App\Actions\QuickAdd;

use App\Domain\Transactions\QuickAddDefaultValues;
use App\Enums\CategoryKind;
use App\Models\Account;
use App\Models\Setting;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class QuickAddDefaults
{
    public const int FREQUENT_CATEGORY_LIMIT = 8;

    public const int FREQUENCY_WINDOW_DAYS = 90;

    public function handle(): QuickAddDefaultValues
    {
        return new QuickAddDefaultValues(
            date: CarbonImmutable::today(),
            accountId: $this->defaultAccountId(),
            frequentExpenseCategoryIds: $this->frequentCategoryIds(CategoryKind::Expense),
            frequentIncomeCategoryIds: $this->frequentCategoryIds(CategoryKind::Income),
        );
    }

    public function defaultAccountId(): ?int
    {
        $settings = Setting::current();
        $writable = Account::query()
            ->active()
            ->whereKey(array_filter([$settings->last_used_account_id, $settings->default_account_id]))
            ->pluck('id')
            ->all();

        foreach ([$settings->last_used_account_id, $settings->default_account_id] as $candidate) {
            if ($candidate !== null && in_array($candidate, $writable, true)) {
                return $candidate;
            }
        }

        $first = Account::query()->active()->ordered()->value('id');

        return is_numeric($first) ? (int) $first : null;
    }

    /**
     * @return list<int>
     */
    private function frequentCategoryIds(CategoryKind $kind): array
    {
        $frequent = DB::table('transactions')
            ->join('categories', 'categories.id', '=', 'transactions.category_id')
            ->leftJoin('categories as parents', 'parents.id', '=', 'categories.parent_id')
            ->whereNull('transactions.deleted_at')
            ->where('transactions.type', $kind->value)
            ->where('transactions.date', '>=', CarbonImmutable::today()->subDays(self::FREQUENCY_WINDOW_DAYS)->toDateString())
            ->whereNull('categories.archived_at')
            ->whereNull('parents.archived_at')
            ->groupBy('transactions.category_id')
            ->orderByRaw('count(*) DESC')
            ->orderByRaw('max(transactions.date) DESC')
            ->orderByRaw('max(transactions.id) DESC')
            ->limit(self::FREQUENT_CATEGORY_LIMIT)
            ->pluck('transactions.category_id')
            ->map(fn (mixed $id): int => is_numeric($id) ? (int) $id : 0)
            ->all();

        $missing = self::FREQUENT_CATEGORY_LIMIT - count($frequent);

        if ($missing <= 0) {
            return array_values($frequent);
        }

        $padding = DB::table('categories')
            ->leftJoin('categories as parents', 'parents.id', '=', 'categories.parent_id')
            ->where('categories.kind', $kind->value)
            ->whereNull('categories.archived_at')
            ->whereNull('parents.archived_at')
            ->whereNotIn('categories.id', $frequent)
            ->whereNotExists(function ($children): void {
                $children->selectRaw('1')
                    ->from('categories as children')
                    ->whereColumn('children.parent_id', 'categories.id')
                    ->whereNull('children.archived_at');
            })
            ->orderByRaw('coalesce(parents.sort_order, categories.sort_order)')
            ->orderByRaw('lower(coalesce(parents.name, categories.name))')
            ->orderByRaw('coalesce(parents.id, categories.id)')
            ->orderBy('categories.sort_order')
            ->orderByRaw('lower(categories.name)')
            ->orderBy('categories.id')
            ->limit($missing)
            ->pluck('categories.id')
            ->map(fn (mixed $id): int => is_numeric($id) ? (int) $id : 0)
            ->all();

        return array_values([...$frequent, ...$padding]);
    }
}
