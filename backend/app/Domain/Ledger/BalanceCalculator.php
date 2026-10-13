<?php

declare(strict_types=1);

namespace App\Domain\Ledger;

use App\Enums\TransactionType;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use stdClass;

final class BalanceCalculator
{
    /**
     * @param  array<int, int>|null  $accountIds
     * @return array<int, AccountLedgerSummary>
     */
    public function summaries(?CarbonImmutable $date = null, ?array $accountIds = null): array
    {
        $query = DB::table('accounts')
            ->leftJoin('transactions', function ($join): void {
                $join->on('transactions.account_id', '=', 'accounts.id')
                    ->whereNull('transactions.deleted_at');
            })
            ->whereNull('accounts.deleted_at')
            ->groupBy('accounts.id', 'accounts.opening_balance_cents')
            ->select('accounts.id')
            ->selectRaw(
                'accounts.opening_balance_cents + COALESCE(SUM(transactions.amount_cents) FILTER (WHERE transactions.date <= ?), 0) AS balance_cents',
                [($date ?? CarbonImmutable::today())->toDateString()],
            )
            ->selectRaw('MAX(transactions.date) AS last_movement_date')
            ->selectRaw(
                'MAX(transactions.date) FILTER (WHERE transactions.type = ?) AS last_adjustment_date',
                [TransactionType::Adjustment->value],
            );

        if ($accountIds !== null) {
            $query->whereIn('accounts.id', $accountIds);
        }

        $summaries = [];

        foreach ($query->get() as $row) {
            $summary = self::summaryFrom($row);
            $summaries[$summary->accountId] = $summary;
        }

        return $summaries;
    }

    public function summary(int $accountId, ?CarbonImmutable $date = null): AccountLedgerSummary
    {
        return $this->summaries($date, [$accountId])[$accountId]
            ?? new AccountLedgerSummary($accountId, 0, null, null);
    }

    /**
     * @return array<int, int>
     */
    public function forAccounts(?CarbonImmutable $date = null): array
    {
        return array_map(
            fn (AccountLedgerSummary $summary): int => $summary->balanceCents,
            $this->summaries($date),
        );
    }

    public function forAccount(int $accountId, ?CarbonImmutable $date = null): int
    {
        return $this->summary($accountId, $date)->balanceCents;
    }

    /**
     * @return array<int, CarbonImmutable|null>
     */
    public function lastMovementDates(): array
    {
        return array_map(
            fn (AccountLedgerSummary $summary): ?CarbonImmutable => $summary->lastMovementDate,
            $this->summaries(),
        );
    }

    /**
     * @return array<int, CarbonImmutable|null>
     */
    public function lastAdjustmentDates(): array
    {
        return array_map(
            fn (AccountLedgerSummary $summary): ?CarbonImmutable => $summary->lastAdjustmentDate,
            $this->summaries(),
        );
    }

    private static function summaryFrom(stdClass $row): AccountLedgerSummary
    {
        return new AccountLedgerSummary(
            accountId: self::integer($row->id),
            balanceCents: self::integer($row->balance_cents),
            lastMovementDate: self::date($row->last_movement_date),
            lastAdjustmentDate: self::date($row->last_adjustment_date),
        );
    }

    private static function integer(mixed $value): int
    {
        return is_numeric($value) ? (int) $value : 0;
    }

    private static function date(mixed $value): ?CarbonImmutable
    {
        return is_string($value) ? CarbonImmutable::createFromFormat('!Y-m-d', $value) ?: null : null;
    }
}
