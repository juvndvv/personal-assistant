<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Domain\Ledger\BalanceCalculator;
use App\Domain\Period\PeriodResolver;
use App\Domain\Transactions\TransactionFilters;
use App\Domain\Transactions\TransactionQuery;
use App\Enums\TransactionType;
use App\Models\Account;
use App\Models\Category;
use App\Models\Transaction;
use Carbon\CarbonImmutable;

final class Ledger
{
    public static function balance(Account|int $account, ?CarbonImmutable $date = null): int
    {
        return app(BalanceCalculator::class)->forAccount($account instanceof Account ? $account->id : $account, $date);
    }

    public static function netWorth(?CarbonImmutable $date = null): int
    {
        return array_sum(app(BalanceCalculator::class)->forAccounts($date));
    }

    /**
     * @return array{income_cents: int, expense_cents: int}
     */
    public static function periodTotals(string $label): array
    {
        $period = app(PeriodResolver::class)->fromLabel($label);

        return app(TransactionQuery::class)->totals(new TransactionFilters(dateFrom: $period->start, dateTo: $period->end));
    }

    public static function expense(Account $account, int $magnitudeCents, string $date, ?Category $category = null, array $attributes = []): Transaction
    {
        return Transaction::factory()->create([
            'type' => TransactionType::Expense,
            'account_id' => $account->id,
            'amount_cents' => -$magnitudeCents,
            'date' => $date,
            'category_id' => ($category ?? Category::factory()->create())->id,
            ...$attributes,
        ]);
    }

    public static function income(Account $account, int $magnitudeCents, string $date, ?Category $category = null, array $attributes = []): Transaction
    {
        return Transaction::factory()->create([
            'type' => TransactionType::Income,
            'account_id' => $account->id,
            'amount_cents' => $magnitudeCents,
            'date' => $date,
            'category_id' => ($category ?? Category::factory()->income()->create())->id,
            ...$attributes,
        ]);
    }
}
