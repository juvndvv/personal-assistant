<?php

declare(strict_types=1);

namespace App\Reports;

use App\Domain\Period\Period;
use App\Models\Transaction;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\Query\JoinClause;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class TrendReport
{
    /**
     * @param  list<Period>  $periods
     * @return list<TrendPoint>
     */
    public function forPeriods(array $periods, ?int $categoryId = null): array
    {
        if ($periods === []) {
            throw new InvalidArgumentException('A trend needs at least one period.');
        }

        $totalsByLabel = $this->totalsByLabel($periods, $categoryId);

        return array_map(function (Period $period) use ($totalsByLabel, $categoryId): TrendPoint {
            $totals = $totalsByLabel[$period->label] ?? ['income' => 0, 'expense' => 0, 'category' => 0];

            return new TrendPoint(
                period: $period,
                incomeCents: $totals['income'],
                expenseCents: $totals['expense'],
                categoryCents: $categoryId === null ? null : $totals['category'],
            );
        }, $periods);
    }

    /**
     * @param  non-empty-list<Period>  $periods
     * @return array<string, array{income: int, expense: int, category: int}>
     */
    private function totalsByLabel(array $periods, ?int $categoryId): array
    {
        $query = Transaction::reportable()
            ->toBase()
            ->joinSub(self::ranges($periods), 'periods', function (JoinClause $join): void {
                $join->whereColumn('transactions.date', '>=', 'periods.starts_on')
                    ->whereColumn('transactions.date', '<=', 'periods.ends_on');
            })
            ->whereBetween('transactions.date', [$periods[0]->start->toDateString(), $periods[array_key_last($periods)]->end->toDateString()])
            ->groupBy('periods.label')
            ->select('periods.label')
            ->selectRaw("COALESCE(SUM(transactions.amount_cents) FILTER (WHERE transactions.type = 'income'), 0) AS income_cents")
            ->selectRaw("COALESCE(-SUM(transactions.amount_cents) FILTER (WHERE transactions.type = 'expense'), 0) AS expense_cents");

        if ($categoryId !== null) {
            $query->selectRaw(
                'COALESCE(SUM(ABS(transactions.amount_cents)) FILTER (WHERE transactions.category_id IN (SELECT id FROM categories WHERE id = ? OR parent_id = ?)), 0) AS category_cents',
                [$categoryId, $categoryId],
            );
        }

        $totals = [];

        foreach ($query->get() as $row) {
            $totals[is_string($row->label) ? $row->label : ''] = [
                'income' => self::integer($row->income_cents),
                'expense' => self::integer($row->expense_cents),
                'category' => self::integer($row->category_cents ?? 0),
            ];
        }

        return $totals;
    }

    /**
     * @param  non-empty-list<Period>  $periods
     */
    private static function ranges(array $periods): Builder
    {
        $rows = implode(', ', array_fill(0, count($periods), '(?, ?::date, ?::date)'));
        $bindings = [];

        foreach ($periods as $period) {
            array_push($bindings, $period->label, $period->start->toDateString(), $period->end->toDateString());
        }

        return DB::query()
            ->fromRaw("(VALUES {$rows}) AS ranges (label, starts_on, ends_on)", $bindings)
            ->select('label', 'starts_on', 'ends_on');
    }

    private static function integer(mixed $value): int
    {
        return is_numeric($value) ? (int) $value : 0;
    }
}
