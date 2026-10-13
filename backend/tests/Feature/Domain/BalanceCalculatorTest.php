<?php

declare(strict_types=1);

use App\Domain\Ledger\BalanceCalculator;
use App\Enums\AccountType;
use App\Models\Account;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Tests\Support\RawLedger;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 12:00', 'Europe/Madrid'));
    $this->calculator = new BalanceCalculator;
});

function account(AccountType $type = AccountType::Checking, int $openingCents = 0, string $openingDate = '2026-01-01'): Account
{
    return Account::factory()->ofType($type)->openedOn(day($openingDate), $openingCents)->create();
}

it('returns the opening balance for an account without movements', function (): void {
    $account = account(openingCents: 150_000);

    expect($this->calculator->forAccount($account->id))->toBe(150_000);
});

it('adds live movements dated up to today', function (): void {
    $account = account(openingCents: 100_000);
    Transaction::factory()->on($account, day('2026-10-01'))->expense(2_350)->create();
    Transaction::factory()->on($account, day('2026-10-13'))->income(50_000)->create();
    Transaction::factory()->on($account, day('2026-10-14'))->expense(9_999)->create();
    Transaction::factory()->on($account, day('2026-10-02'))->expense(1_000)->create()->delete();
    Transaction::factory()->on($account, day('2026-10-05'))->adjustment(-650, 147_000)->create();

    expect($this->calculator->forAccount($account->id))->toBe(100_000 - 2_350 + 50_000 - 650)
        ->and($this->calculator->forAccount($account->id, day('2026-10-14')))->toBe(100_000 - 2_350 + 50_000 - 650 - 9_999)
        ->and($this->calculator->forAccount($account->id, day('2026-10-01')))->toBe(100_000 - 2_350)
        ->and($this->calculator->forAccount($account->id, day('2025-12-31')))->toBe(100_000);
});

it('moves money between accounts with transfer legs', function (): void {
    $checking = account(openingCents: 100_000);
    $savings = account(AccountType::SavingsInvestment);
    RawLedger::balancedTransfer($checking->id, $savings->id, 10_000, '2026-10-01');

    expect($this->calculator->forAccounts())->toBe([
        $checking->id => 90_000,
        $savings->id => 10_000,
    ]);
});

it('includes archived accounts and excludes soft-deleted ones', function (): void {
    $archived = Account::factory()->archived()->openedOn(day('2026-01-01'), 500)->create();
    $deleted = account(openingCents: 700);
    $deleted->delete();

    $balances = $this->calculator->forAccounts();

    expect($balances)->toHaveKey($archived->id)
        ->and($balances[$archived->id])->toBe(500)
        ->and($balances)->not->toHaveKey($deleted->id);
});

it('computes every account in a single query', function (): void {
    foreach (range(1, 5) as $index) {
        Transaction::factory()->on(account())->expense(100 * $index)->create();
    }

    DB::enableQueryLog();
    $this->calculator->summaries();

    expect(DB::getQueryLog())->toHaveCount(1);
});

it('reports the last movement and adjustment dates', function (): void {
    $account = account(AccountType::Cash);
    $empty = account();
    Transaction::factory()->on($account, day('2026-09-01'))->adjustment(500, 500)->create();
    Transaction::factory()->on($account, day('2026-10-02'))->expense(100)->create();

    $movements = $this->calculator->lastMovementDates();
    $adjustments = $this->calculator->lastAdjustmentDates();

    expect($movements[$account->id]?->toDateString())->toBe('2026-10-02')
        ->and($adjustments[$account->id]?->toDateString())->toBe('2026-09-01')
        ->and($movements[$empty->id])->toBeNull()
        ->and($adjustments[$empty->id])->toBeNull();
});

it('derives last_updated_on from adjustments for manually valued accounts', function (AccountType $type, ?string $adjustment, ?string $movement, string $expected): void {
    $account = account($type, openingDate: '2026-01-15');

    if ($adjustment !== null) {
        Transaction::factory()->on($account, day($adjustment))->adjustment(100, 100)->create();
    }

    if ($movement !== null) {
        Transaction::factory()->on($account, day($movement))->expense(10)->create();
    }

    expect($this->calculator->summary($account->id)->lastUpdatedOn($account)->toDateString())->toBe($expected);
})->with([
    'cash prefers the adjustment' => [AccountType::Cash, '2026-08-01', '2026-10-01', '2026-08-01'],
    'savings prefers the adjustment' => [AccountType::SavingsInvestment, '2026-08-01', '2026-10-01', '2026-08-01'],
    'cash falls back to the last movement' => [AccountType::Cash, null, '2026-10-01', '2026-10-01'],
    'cash falls back to the opening date' => [AccountType::Cash, null, null, '2026-01-15'],
    'checking uses the last movement' => [AccountType::Checking, '2026-08-01', '2026-10-01', '2026-10-01'],
    'card falls back to the opening date' => [AccountType::CreditCard, null, null, '2026-01-15'],
]);

it('flags only stale manually valued accounts', function (AccountType $type, string $lastUpdate, bool $stale): void {
    $account = account($type);
    Transaction::factory()->on($account, day($lastUpdate))->adjustment(100, 100)->create();

    expect($this->calculator->summary($account->id)->isStale($account, CarbonImmutable::today()))->toBe($stale);
})->with([
    'cash updated 31 days ago' => [AccountType::Cash, '2026-09-12', true],
    'cash updated 30 days ago' => [AccountType::Cash, '2026-09-13', false],
    'savings updated 60 days ago' => [AccountType::SavingsInvestment, '2026-08-14', true],
    'checking never stale' => [AccountType::Checking, '2026-01-02', false],
    'card never stale' => [AccountType::CreditCard, '2026-01-02', false],
]);
