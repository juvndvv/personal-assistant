<?php

declare(strict_types=1);

use App\Actions\Transactions\DeleteTransaction;
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

dataset('month start days', [
    'calendar month' => [1, '2026-10-01', '2026-10-31'],
    'payday on the 25th' => [25, '2026-09-25', '2026-10-24'],
]);

it('reports the golden ledger with income, expense, net and savings rate', function (int $startDay, string $start, string $end): void {
    Reports::useMonthStartDay($startDay);
    Reports::goldenLedger();

    $this->getJson('/api/v1/reports/summary?period=2026-10')
        ->assertOk()
        ->assertJsonPath('data.period', ['label' => '2026-10', 'start' => $start, 'end' => $end, 'month_start_day' => $startDay])
        ->assertJsonPath('data.income_cents', 200_000)
        ->assertJsonPath('data.expense_cents', 150_000)
        ->assertJsonPath('data.net_cents', 50_000)
        ->assertJsonPath('data.savings_rate_bp', 2_500);
})->with('month start days');

it('rolls subcategories into their parent and reports the parent own spend and shares', function (): void {
    $ledger = Reports::goldenLedger();

    $this->getJson('/api/v1/reports/summary?period=2026-10')
        ->assertOk()
        ->assertExactJson(['data' => [
            'period' => ['label' => '2026-10', 'start' => '2026-10-01', 'end' => '2026-10-31', 'month_start_day' => 1],
            'income_cents' => 200_000,
            'expense_cents' => 150_000,
            'net_cents' => 50_000,
            'savings_rate_bp' => 2_500,
            'by_category' => [
                'expense' => [
                    [
                        'category_id' => $ledger['food']->id,
                        'name' => 'Alimentación',
                        'amount_cents' => 100_000,
                        'share_bp' => 6_667,
                        'own_cents' => 20_000,
                        'children' => [
                            ['category_id' => $ledger['supermarket']->id, 'name' => 'Supermercado', 'amount_cents' => 80_000, 'share_bp' => 5_333],
                        ],
                    ],
                    [
                        'category_id' => $ledger['housing']->id,
                        'name' => 'Vivienda',
                        'amount_cents' => 50_000,
                        'share_bp' => 3_333,
                        'own_cents' => 50_000,
                        'children' => [],
                    ],
                ],
                'income' => [
                    [
                        'category_id' => $ledger['salary']->id,
                        'name' => 'Nómina',
                        'amount_cents' => 200_000,
                        'share_bp' => 10_000,
                        'own_cents' => 200_000,
                        'children' => [],
                    ],
                ],
            ],
        ]]);
});

it('omits categories without movements in the period, including untouched children', function (): void {
    $ledger = Reports::goldenLedger();
    Category::factory()->childOf($ledger['food'])->create(['name' => 'Cafeterías']);
    $unused = Category::factory()->create(['name' => 'Ocio']);
    Ledger::expense($ledger['checking'], 9_999, '2026-09-15', $unused);

    $response = $this->getJson('/api/v1/reports/summary?period=2026-10')->assertOk();

    expect(collect($response->json('data.by_category.expense'))->pluck('name')->all())->toBe(['Alimentación', 'Vivienda'])
        ->and(collect($response->json('data.by_category.expense.0.children'))->pluck('name')->all())->toBe(['Supermercado']);
});

it('reports a child of an archived parent under that parent', function (): void {
    $ledger = Reports::goldenLedger();
    $ledger['food']->update(['archived_at' => now()]);

    $this->getJson('/api/v1/reports/summary?period=2026-10')
        ->assertOk()
        ->assertJsonPath('data.by_category.expense.0.category_id', $ledger['food']->id)
        ->assertJsonPath('data.by_category.expense.0.amount_cents', 100_000);
});

it('places boundary dates in the right period when the month starts on the 25th', function (): void {
    Reports::useMonthStartDay(25);
    $account = Account::factory()->openedOn(day('2026-01-01'))->create();
    $category = Category::factory()->create();
    Ledger::expense($account, 1_000, '2026-10-24', $category);
    Ledger::expense($account, 2_000, '2026-10-25', $category);
    Ledger::expense($account, 4_000, '2026-09-25', $category);
    Ledger::expense($account, 8_000, '2026-09-24', $category);

    $this->getJson('/api/v1/reports/summary?period=2026-10')->assertOk()->assertJsonPath('data.expense_cents', 5_000);
    $this->getJson('/api/v1/reports/summary?period=2026-11')->assertOk()->assertJsonPath('data.expense_cents', 2_000);
    $this->getJson('/api/v1/reports/summary?period=2026-09')->assertOk()->assertJsonPath('data.expense_cents', 8_000);
});

it('re-buckets history when month_start_day changes', function (): void {
    $account = Account::factory()->openedOn(day('2026-01-01'))->create();
    $category = Category::factory()->create();
    Ledger::expense($account, 1_000, '2026-10-24', $category);
    Ledger::expense($account, 2_000, '2026-10-25', $category);

    $this->getJson('/api/v1/reports/summary?period=2026-10')->assertOk()->assertJsonPath('data.expense_cents', 3_000);

    $this->patchJson('/api/v1/settings', ['month_start_day' => 25])->assertOk();

    $this->getJson('/api/v1/reports/summary?period=2026-10')->assertOk()->assertJsonPath('data.expense_cents', 1_000);
    $this->getJson('/api/v1/reports/summary?period=2026-11')->assertOk()->assertJsonPath('data.expense_cents', 2_000);
});

it('never counts transfers, card settlements, adjustments or deleted movements', function (): void {
    $ledger = Reports::goldenLedger();
    $deleted = Ledger::expense($ledger['checking'], 77_700, '2026-10-08', $ledger['housing']);
    app(DeleteTransaction::class)->handle($deleted);

    $this->getJson('/api/v1/reports/summary?period=2026-10')
        ->assertOk()
        ->assertJsonPath('data.income_cents', 200_000)
        ->assertJsonPath('data.expense_cents', 150_000);

    expect(DB::table('transactions')->whereIn('type', ['transfer', 'adjustment'])->whereNull('deleted_at')->count())->toBe(5);
});

it('returns a null savings rate without income and a negative one when spending exceeds income', function (): void {
    $account = Account::factory()->openedOn(day('2026-01-01'))->create();
    Ledger::expense($account, 5_000, '2026-10-03');

    $this->getJson('/api/v1/reports/summary?period=2026-10')
        ->assertOk()
        ->assertJsonPath('data.income_cents', 0)
        ->assertJsonPath('data.net_cents', -5_000)
        ->assertJsonPath('data.savings_rate_bp', null);

    Ledger::income($account, 4_000, '2026-10-04');

    $this->getJson('/api/v1/reports/summary?period=2026-10')->assertOk()->assertJsonPath('data.savings_rate_bp', -2_500);
});

it('returns an empty report for a period without movements', function (): void {
    $this->getJson('/api/v1/reports/summary?period=2020-01')
        ->assertOk()
        ->assertJsonPath('data.income_cents', 0)
        ->assertJsonPath('data.expense_cents', 0)
        ->assertJsonPath('data.net_cents', 0)
        ->assertJsonPath('data.savings_rate_bp', null)
        ->assertJsonPath('data.by_category', ['expense' => [], 'income' => []]);
});

it('defaults to the current period', function (): void {
    Reports::useMonthStartDay(25);

    $this->getJson('/api/v1/reports/summary')
        ->assertOk()
        ->assertJsonPath('data.period.label', '2026-11')
        ->assertJsonPath('data.period.start', '2026-10-25');
});

it('matches a raw SQL cross-check of reportable rows for every period', function (int $startDay): void {
    Reports::useMonthStartDay($startDay);
    $ledger = Reports::goldenLedger();
    mt_srand(2_026);

    foreach (range(1, 120) as $index) {
        $date = day('2026-07-01')->addDays(mt_rand(0, 150))->toDateString();
        $index % 4 === 0
            ? Ledger::income($ledger['checking'], mt_rand(100, 90_000), $date, $ledger['salary'])
            : Ledger::expense($ledger['card'], mt_rand(100, 20_000), $date, $index % 3 === 0 ? $ledger['supermarket'] : $ledger['housing']);
    }

    foreach (['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'] as $label) {
        $response = $this->getJson("/api/v1/reports/summary?period={$label}")->assertOk();
        $start = $response->json('data.period.start');
        $end = $response->json('data.period.end');

        $raw = DB::selectOne(<<<'SQL'
            SELECT
                COALESCE(SUM(amount_cents) FILTER (WHERE type = 'income'), 0) AS income,
                COALESCE(-SUM(amount_cents) FILTER (WHERE type = 'expense'), 0) AS expense
            FROM transactions
            WHERE deleted_at IS NULL AND type IN ('income', 'expense') AND date BETWEEN ? AND ?
            SQL, [$start, $end]);

        $categoryTotal = collect($response->json('data.by_category.expense'))->sum('amount_cents');

        expect($response->json('data.income_cents'))->toBe((int) $raw->income)
            ->and($response->json('data.expense_cents'))->toBe((int) $raw->expense)
            ->and($categoryTotal)->toBe((int) $raw->expense);
    }
})->with([1, 25]);

it('validates the period label', function (string $label): void {
    $this->getJson("/api/v1/reports/summary?period={$label}")->assertUnprocessable()->assertJsonValidationErrors('period');
})->with(['2026-13', '0000-01', '1899-12', '3000-01']);
