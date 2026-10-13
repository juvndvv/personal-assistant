<?php

declare(strict_types=1);

namespace App\Reports;

use App\Domain\Period\Period;
use App\Enums\CategoryKind;
use App\Models\Category;
use App\Models\Transaction;
use Illuminate\Database\Eloquent\Collection;

final class PeriodSummaryReport
{
    public function forPeriod(Period $period): PeriodSummary
    {
        $amountsByCategory = $this->amountsByCategory($period);
        $categories = $this->categoriesWithParents(array_keys($amountsByCategory));

        $expense = $this->breakdown(CategoryKind::Expense, $amountsByCategory, $categories);
        $income = $this->breakdown(CategoryKind::Income, $amountsByCategory, $categories);

        return new PeriodSummary(
            period: $period,
            incomeCents: self::total($income),
            expenseCents: self::total($expense),
            expenseCategories: $expense,
            incomeCategories: $income,
        );
    }

    /**
     * @return array<int, int>
     */
    private function amountsByCategory(Period $period): array
    {
        $rows = Transaction::reportable()
            ->whereBetween('date', [$period->start->toDateString(), $period->end->toDateString()])
            ->toBase()
            ->select('category_id')
            ->selectRaw('SUM(ABS(amount_cents)) AS amount_cents')
            ->groupBy('category_id')
            ->get();

        $amounts = [];

        foreach ($rows as $row) {
            if (is_numeric($row->category_id) && is_numeric($row->amount_cents) && (int) $row->amount_cents !== 0) {
                $amounts[(int) $row->category_id] = (int) $row->amount_cents;
            }
        }

        return $amounts;
    }

    /**
     * @param  list<int>  $categoryIds
     * @return Collection<int, Category>
     */
    private function categoriesWithParents(array $categoryIds): Collection
    {
        if ($categoryIds === []) {
            return new Collection;
        }

        return Category::query()
            ->whereIn('id', $categoryIds)
            ->orWhereIn('id', Category::query()->select('parent_id')->whereIn('id', $categoryIds)->whereNotNull('parent_id'))
            ->get()
            ->keyBy('id');
    }

    /**
     * @param  array<int, int>  $amountsByCategory
     * @param  Collection<int, Category>  $categories
     * @return list<CategoryTotal>
     */
    private function breakdown(CategoryKind $kind, array $amountsByCategory, Collection $categories): array
    {
        $ownCents = [];
        $childCents = [];

        foreach ($amountsByCategory as $categoryId => $amountCents) {
            $category = $categories->get($categoryId);

            if ($category === null || $category->kind !== $kind) {
                continue;
            }

            $topLevelId = $category->parent_id ?? $category->id;
            $ownCents[$topLevelId] ??= 0;

            if ($category->parent_id === null) {
                $ownCents[$topLevelId] += $amountCents;
            } else {
                $childCents[$topLevelId][$categoryId] = $amountCents;
            }
        }

        $kindTotal = array_sum($ownCents) + array_sum(array_map(array_sum(...), $childCents));
        $totals = [];

        foreach ($ownCents as $topLevelId => $own) {
            $children = [];

            foreach ($childCents[$topLevelId] ?? [] as $childId => $amountCents) {
                $children[] = new SubcategoryTotal($childId, self::name($categories, $childId), $amountCents, self::share($amountCents, $kindTotal));
            }

            $amountCents = $own + array_sum(array_map(fn (SubcategoryTotal $child): int => $child->amountCents, $children));

            $totals[] = new CategoryTotal(
                categoryId: $topLevelId,
                name: self::name($categories, $topLevelId),
                amountCents: $amountCents,
                shareBp: self::share($amountCents, $kindTotal),
                ownCents: $own,
                children: self::sorted($children),
            );
        }

        return self::sorted($totals);
    }

    /**
     * @param  list<CategoryTotal>  $totals
     */
    private static function total(array $totals): int
    {
        return array_sum(array_map(fn (CategoryTotal $total): int => $total->amountCents, $totals));
    }

    private static function share(int $amountCents, int $kindTotal): int
    {
        return BasisPoints::ratio($amountCents, $kindTotal) ?? 0;
    }

    /**
     * @param  Collection<int, Category>  $categories
     */
    private static function name(Collection $categories, int $categoryId): string
    {
        return $categories->get($categoryId)->name ?? '';
    }

    /**
     * @template T of CategoryTotal|SubcategoryTotal
     *
     * @param  list<T>  $totals
     * @return list<T>
     */
    private static function sorted(array $totals): array
    {
        usort($totals, fn (CategoryTotal|SubcategoryTotal $left, CategoryTotal|SubcategoryTotal $right): int => [$right->amountCents, $left->name, $left->categoryId]
            <=> [$left->amountCents, $right->name, $right->categoryId]);

        return $totals;
    }
}
