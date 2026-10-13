<?php

declare(strict_types=1);

namespace App\Reports;

use App\Domain\Ledger\AccountLedgerSummary;
use App\Domain\Ledger\BalanceCalculator;
use App\Models\Account;
use Carbon\CarbonImmutable;

final readonly class NetWorthReport
{
    public function __construct(private BalanceCalculator $balances) {}

    public function at(CarbonImmutable $date, CarbonImmutable $today): NetWorth
    {
        $summaries = $this->balances->summaries($date);

        $accounts = [];

        foreach (Account::query()->whereDate('opening_date', '<=', $date->toDateString())->ordered()->get() as $account) {
            $summary = $summaries[$account->id] ?? new AccountLedgerSummary($account->id, $account->opening_balance_cents, null, null);

            $accounts[] = new NetWorthAccount(
                account: $account,
                balanceCents: $summary->balanceCents,
                lastUpdatedOn: $summary->lastUpdatedOn($account),
                stale: $summary->isStale($account, $today),
            );
        }

        return new NetWorth($date, $accounts);
    }
}
