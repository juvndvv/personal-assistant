<?php

declare(strict_types=1);

namespace App\Domain\Transactions;

use App\Enums\TransactionType;
use App\Enums\TransferLeg;
use App\Models\Transaction;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;

final class TransactionQuery
{
    private const string SEARCH_DOCUMENT = "public.f_unaccent(lower(coalesce(transactions.description, '') || ' ' || coalesce(transactions.merchant, '') || ' ' || coalesce(transactions.note, '')))";

    /**
     * @return Builder<Transaction>
     */
    public function filtered(TransactionFilters $filters, bool $collapseTransfers = true): Builder
    {
        $query = Transaction::query();

        $this->applySearch($query, $filters->search);

        if ($filters->types !== []) {
            $query->whereIn('transactions.type', array_map(fn (TransactionType $type): string => $type->value, $filters->types));
        }

        if ($filters->accountIds !== []) {
            $query->whereIn('transactions.account_id', $filters->accountIds);
        } elseif ($collapseTransfers) {
            $query->where(function (Builder $legs): void {
                $legs->whereNull('transactions.transfer_leg')
                    ->orWhere('transactions.transfer_leg', TransferLeg::Out->value);
            });
        }

        if ($filters->categoryIds !== []) {
            $query->whereIn('transactions.category_id', function (QueryBuilder $categories) use ($filters): void {
                $categories->select('id')
                    ->from('categories')
                    ->whereIn('id', $filters->categoryIds)
                    ->orWhereIn('parent_id', $filters->categoryIds);
            });
        }

        $this->applyTags($query, $filters);

        if ($filters->origins !== []) {
            $query->whereIn('transactions.origin', array_map(fn ($origin): string => $origin->value, $filters->origins));
        }

        if ($filters->dateFrom !== null) {
            $query->where('transactions.date', '>=', $filters->dateFrom->toDateString());
        }

        if ($filters->dateTo !== null) {
            $query->where('transactions.date', '<=', $filters->dateTo->toDateString());
        }

        if ($filters->amountMinCents !== null) {
            $query->whereRaw('abs(transactions.amount_cents) >= ?', [$filters->amountMinCents]);
        }

        if ($filters->amountMaxCents !== null) {
            $query->whereRaw('abs(transactions.amount_cents) <= ?', [$filters->amountMaxCents]);
        }

        if ($filters->hasAttachments === true) {
            $query->whereRaw('false');
        }

        return $query;
    }

    /**
     * @return Builder<Transaction>
     */
    public function sorted(TransactionFilters $filters, bool $collapseTransfers = true): Builder
    {
        $query = $this->filtered($filters, $collapseTransfers)->select('transactions.*');

        return match ($filters->sort) {
            TransactionSort::DateDesc => $query->orderByDesc('transactions.date')->orderByDesc('transactions.id'),
            TransactionSort::DateAsc => $query->orderBy('transactions.date')->orderBy('transactions.id'),
            TransactionSort::AmountDesc => $query->orderByRaw('abs(transactions.amount_cents) DESC')->orderByDesc('transactions.id'),
            TransactionSort::AmountAsc => $query->orderByRaw('abs(transactions.amount_cents) ASC')->orderByDesc('transactions.id'),
        };
    }

    /**
     * @return array{income_cents: int, expense_cents: int}
     */
    public function totals(TransactionFilters $filters): array
    {
        $row = $this->filtered($filters)
            ->reportable()
            ->toBase()
            ->selectRaw("COALESCE(SUM(transactions.amount_cents) FILTER (WHERE transactions.type = 'income'), 0) AS income_cents")
            ->selectRaw("COALESCE(-SUM(transactions.amount_cents) FILTER (WHERE transactions.type = 'expense'), 0) AS expense_cents")
            ->first();

        return [
            'income_cents' => is_numeric($row?->income_cents) ? (int) $row->income_cents : 0,
            'expense_cents' => is_numeric($row?->expense_cents) ? (int) $row->expense_cents : 0,
        ];
    }

    /**
     * @param  Builder<Transaction>  $query
     */
    private function applySearch(Builder $query, ?string $search): void
    {
        $search = $search === null ? '' : trim($search);

        if ($search === '') {
            return;
        }

        $pattern = '%'.addcslashes($search, '\\%_').'%';

        $query->whereRaw(self::SEARCH_DOCUMENT.' ILIKE public.f_unaccent(lower(?))', [$pattern]);
    }

    /**
     * @param  Builder<Transaction>  $query
     */
    private function applyTags(Builder $query, TransactionFilters $filters): void
    {
        $tagIds = array_values(array_unique($filters->tagIds));

        if ($tagIds === []) {
            return;
        }

        if ($filters->tagMatch === TagMatch::Any) {
            $query->whereExists(function (QueryBuilder $tags) use ($tagIds): void {
                $tags->select(DB::raw('1'))
                    ->from('tag_transaction')
                    ->whereColumn('tag_transaction.transaction_id', 'transactions.id')
                    ->whereIn('tag_transaction.tag_id', $tagIds);
            });

            return;
        }

        $query->whereRaw(
            '(SELECT count(*) FROM tag_transaction WHERE tag_transaction.transaction_id = transactions.id AND tag_transaction.tag_id IN ('.implode(',', array_fill(0, count($tagIds), '?')).')) = ?',
            [...$tagIds, count($tagIds)],
        );
    }
}
