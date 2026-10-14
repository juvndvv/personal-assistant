<?php

declare(strict_types=1);

namespace App\Actions\Exports;

use App\Domain\Exports\CsvWriter;
use App\Domain\Transactions\TransactionFilters;
use App\Domain\Transactions\TransactionQuery;
use App\Enums\CsvDelimiter;
use App\Models\Tag;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

final readonly class ExportTransactionsCsv
{
    public const array COLUMNS = [
        'id', 'date', 'type', 'account', 'account_type', 'category', 'parent_category', 'amount_cents', 'amount_eur',
        'description', 'merchant', 'note', 'tags', 'origin', 'transfer_id', 'transfer_kind', 'transfer_leg',
        'counter_account', 'adjustment_target_cents', 'recurring_template', 'attachments_count', 'created_at',
    ];

    public const string TAG_SEPARATOR = '|';

    private const int CHUNK_SIZE = 500;

    private const array RELATIONS = [
        'account', 'category.parent', 'transfer.fromAccount', 'transfer.toAccount', 'tags', 'recurringOccurrence.template',
    ];

    public function __construct(private TransactionQuery $transactions) {}

    /**
     * @param  resource  $output
     */
    public function handle(TransactionFilters $filters, CsvDelimiter $delimiter, $output): void
    {
        $this->write($this->transactions->filtered($filters, collapseTransfers: false), $delimiter, $output, includeDeleted: false);
    }

    /**
     * @param  resource  $output
     */
    public function handleIncludingDeleted(CsvDelimiter $delimiter, $output): void
    {
        $this->write(Transaction::withTrashed(), $delimiter, $output, includeDeleted: true);
    }

    /**
     * @param  Builder<Transaction>  $query
     * @param  resource  $output
     */
    private function write(Builder $query, CsvDelimiter $delimiter, $output, bool $includeDeleted): void
    {
        $writer = CsvWriter::start($output, $delimiter, $includeDeleted ? [...self::COLUMNS, 'deleted_at'] : self::COLUMNS);

        $rows = $query->with(self::RELATIONS)
            ->withReceiptsCount()
            ->lazyById(self::CHUNK_SIZE, 'transactions.id', 'id');

        foreach ($rows as $transaction) {
            $cells = self::cells($transaction, $writer);

            if ($includeDeleted) {
                $cells[] = $transaction->deleted_at;
            }

            $writer->row($cells);
        }
    }

    /**
     * @return list<int|string|CarbonImmutable|null>
     */
    private static function cells(Transaction $transaction, CsvWriter $writer): array
    {
        $transfer = $transaction->transfer;
        $category = $transaction->category;
        $counterAccount = $transfer === null
            ? null
            : ($transaction->account_id === $transfer->from_account_id ? $transfer->toAccount : $transfer->fromAccount);

        return [
            $transaction->id,
            $transaction->date->toDateString(),
            $transaction->type->value,
            $transaction->account->name,
            $transaction->account->type->value,
            $category?->name,
            $category?->parent?->name,
            $transaction->amount_cents,
            $writer->euros($transaction->amount_cents),
            $transaction->description,
            $transaction->merchant,
            $transaction->note,
            $transaction->tags->sortBy('name')->map(fn (Tag $tag): string => $tag->name)->implode(self::TAG_SEPARATOR),
            $transaction->origin->value,
            $transaction->transfer_id,
            $transfer?->kind->value,
            $transaction->transfer_leg?->value,
            $counterAccount?->name,
            $transaction->adjustment_target_cents,
            $transaction->recurringOccurrence?->template->name,
            $transaction->attachments_count ?? 0,
            $transaction->created_at,
        ];
    }
}
