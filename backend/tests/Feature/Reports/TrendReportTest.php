<?php

declare(strict_types=1);

use App\Actions\Ledger\RecordBalanceAdjustment;
use App\Actions\Transactions\DeleteTransaction;
use App\Actions\Transfers\RegisterTransfer;
use App\Enums\AccountType;
use App\Enums\TransferKind;
use App\Models\Account;
use App\Models\Category;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Tests\Support\Ledger;
use Tests\Support\Reports;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-11-15 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());
});

function trendQueryCount(Closure $request): int
{
    DB::flushQueryLog();
    DB::enableQueryLog();
    $request();
    $count = count(DB::getQueryLog());
    DB::disableQueryLog();

    return $count;
}

it('returns twelve zero-filled periods, oldest first, ending at the current period by default', function (): void {
    $response = $this->getJson('/api/v1/reports/trend')->assertOk()->assertJsonCount(12, 'data');

    expect(collect($response->json('data'))->pluck('period.label')->all())->toBe([
        '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
        '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11',
    ])
        ->and($response->json('data.0'))->toBe([
            'period' => ['label' => '2025-12', 'start' => '2025-12-01', 'end' => '2025-12-31', 'month_start_day' => 1],
            'income_cents' => 0,
            'expense_cents' => 0,
            'savings_rate_bp' => null,
        ]);
});

it('reports the golden ledger in its period with either month start day', function (int $startDay): void {
    Reports::useMonthStartDay($startDay);
    Reports::goldenLedger();

    $response = $this->getJson('/api/v1/reports/trend?periods=3&until=2026-11')->assertOk()->assertJsonCount(3, 'data');

    expect(collect($response->json('data'))->map(fn (array $point): array => [
        $point['period']['label'], $point['income_cents'], $point['expense_cents'], $point['savings_rate_bp'],
    ])->all())->toBe([
        ['2026-09', 0, 0, null],
        ['2026-10', 200_000, 150_000, 2_500],
        ['2026-11', 0, 0, null],
    ]);
})->with([1, 25]);

it('buckets boundary dates with month_start_day 25', function (): void {
    Reports::useMonthStartDay(25);
    $account = Account::factory()->openedOn(day('2026-01-01'))->create();
    $category = Category::factory()->create();
    Ledger::expense($account, 1_000, '2026-10-24', $category);
    Ledger::expense($account, 2_000, '2026-10-25', $category);

    $response = $this->getJson('/api/v1/reports/trend?periods=2&until=2026-11')->assertOk();

    expect($response->json('data.0.period.label'))->toBe('2026-10')
        ->and($response->json('data.0.expense_cents'))->toBe(1_000)
        ->and($response->json('data.1.expense_cents'))->toBe(2_000);
});

it('adds category_cents for a category including its children only when requested', function (): void {
    $ledger = Reports::goldenLedger();
    Ledger::expense($ledger['checking'], 7_000, '2026-09-10', $ledger['supermarket']);

    $withCategory = $this->getJson("/api/v1/reports/trend?periods=2&until=2026-10&category_id={$ledger['food']->id}")->assertOk();
    $withChild = $this->getJson("/api/v1/reports/trend?periods=2&until=2026-10&category_id={$ledger['supermarket']->id}")->assertOk();
    $withIncome = $this->getJson("/api/v1/reports/trend?periods=2&until=2026-10&category_id={$ledger['salary']->id}")->assertOk();
    $without = $this->getJson('/api/v1/reports/trend?periods=2&until=2026-10')->assertOk();

    expect(collect($withCategory->json('data'))->pluck('category_cents')->all())->toBe([7_000, 100_000])
        ->and(collect($withChild->json('data'))->pluck('category_cents')->all())->toBe([7_000, 80_000])
        ->and(collect($withIncome->json('data'))->pluck('category_cents')->all())->toBe([0, 200_000])
        ->and($without->json('data.1'))->not->toHaveKey('category_cents');
});

it('runs a constant number of queries regardless of periods and data', function (): void {
    $empty = trendQueryCount(fn () => $this->getJson('/api/v1/reports/trend?periods=1')->assertOk());

    $ledger = Reports::goldenLedger();
    Ledger::expense($ledger['checking'], 1_000, '2026-01-03', $ledger['housing']);

    $one = trendQueryCount(fn () => $this->getJson('/api/v1/reports/trend?periods=1&until=2026-10')->assertOk());
    $many = trendQueryCount(fn () => $this->getJson('/api/v1/reports/trend?periods=24')->assertOk());
    $withCategory = trendQueryCount(fn () => $this->getJson("/api/v1/reports/trend?periods=24&category_id={$ledger['food']->id}")->assertOk());

    expect($one)->toBe($empty)
        ->and($many)->toBe($empty)
        ->and($withCategory)->toBe($empty + 1);
});

it('validates periods, until and category_id', function (string $query, string $field): void {
    $this->getJson("/api/v1/reports/trend?{$query}")->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    ['periods=0', 'periods'],
    ['periods=25', 'periods'],
    ['periods=abc', 'periods'],
    ['until=2026-1', 'until'],
    ['until=0001-06&periods=24', 'until'],
    ['until=3000-01', 'until'],
    ['category_id=999999', 'category_id'],
]);

it('matches a raw SQL cross-check of reportable rows for every trend point', function (int $startDay): void {
    Reports::useMonthStartDay($startDay);
    $checking = Account::factory()->openedOn(day('2025-01-01'), 100_000)->create();
    $savings = Account::factory()->ofType(AccountType::SavingsInvestment)->openedOn(day('2025-01-01'), 500_000)->create();
    $card = Account::factory()->creditCard()->openedOn(day('2025-01-01'))->create();
    $housing = Category::factory()->create();
    $salary = Category::factory()->income()->create();
    mt_srand(2_027);

    foreach (range(1, 160) as $index) {
        $date = day('2025-11-01')->addDays(mt_rand(0, 380))->toDateString();
        $index % 4 === 0
            ? Ledger::income($checking, mt_rand(100, 90_000), $date, $salary)
            : Ledger::expense($index % 2 === 0 ? $checking : $card, mt_rand(100, 20_000), $date, $housing);
    }

    app(DeleteTransaction::class)->handle(Ledger::expense($checking, 55_555, '2026-02-10', $housing));
    app(RegisterTransfer::class)->handle($checking->id, $savings->id, 33_333, day('2026-01-02'));
    app(RegisterTransfer::class)->handle($checking->id, $card->id, 44_444, day('2025-12-26'), TransferKind::CardSettlement);
    app(RecordBalanceAdjustment::class)->handle($savings, day('2026-03-15'), Ledger::balance($savings, day('2026-03-15')) + 12_345);

    expect(DB::table('transactions')->whereIn('type', ['transfer', 'adjustment'])->whereNull('deleted_at')->count())->toBeGreaterThan(0)
        ->and(DB::table('transactions')->whereNotNull('deleted_at')->count())->toBe(1);

    $response = $this->getJson('/api/v1/reports/trend?periods=12')->assertOk()->assertJsonCount(12, 'data');

    foreach ($response->json('data') as $point) {
        $raw = DB::selectOne(<<<'SQL'
            SELECT
                COALESCE(SUM(amount_cents) FILTER (WHERE type = 'income'), 0) AS income,
                COALESCE(-SUM(amount_cents) FILTER (WHERE type = 'expense'), 0) AS expense
            FROM transactions
            WHERE deleted_at IS NULL AND type IN ('income', 'expense') AND date BETWEEN ? AND ?
            SQL, [$point['period']['start'], $point['period']['end']]);

        expect($point['income_cents'])->toBe((int) $raw->income)
            ->and($point['expense_cents'])->toBe((int) $raw->expense);
    }

    expect(collect($response->json('data'))->sum('expense_cents'))->toBeGreaterThan(0);
})->with([1, 25]);
