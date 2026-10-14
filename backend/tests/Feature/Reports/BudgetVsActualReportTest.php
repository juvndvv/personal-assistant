<?php

declare(strict_types=1);

use App\Actions\Budgets\SetBudget;
use App\Actions\Ledger\RecordBalanceAdjustment;
use App\Actions\Transactions\DeleteTransaction;
use App\Actions\Transfers\RegisterTransfer;
use App\Models\Account;
use App\Models\Category;
use App\Models\User;
use Carbon\CarbonImmutable;
use Tests\Support\Ledger;
use Tests\Support\Reports;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-14 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());
    $this->account = Account::factory()->openedOn(day('2026-01-01'), 100_000)->create();
});

function categorySummary(Category $category): array
{
    return ['id' => $category->id, 'name' => $category->name, 'kind' => 'expense', 'parent_id' => null, 'parent_name' => null];
}

it('compares budgets with actual spend across payday boundaries, parents including subcategories', function (): void {
    Reports::useMonthStartDay(25);
    $account = $this->account;
    $savings = Account::factory()->openedOn(day('2026-01-01'))->create();

    $food = Category::factory()->create(['name' => 'Alimentación', 'sort_order' => 0]);
    $supermarket = Category::factory()->childOf($food)->create(['name' => 'Supermercado']);
    $housing = Category::factory()->create(['name' => 'Vivienda', 'sort_order' => 1]);
    $transport = Category::factory()->create(['name' => 'Transporte', 'sort_order' => 2]);
    $leisure = Category::factory()->create(['name' => 'Ocio', 'sort_order' => 3]);
    $stopped = Category::factory()->create(['name' => 'Suscripciones', 'sort_order' => 4]);
    $unused = Category::factory()->create(['name' => 'Regalos', 'sort_order' => 5]);

    $budgets = app(SetBudget::class);
    $budgets->handle($food->id, 50_000, '2026-07');
    $budgets->handle($housing->id, 50_000, '2026-09');
    $budgets->handle($transport->id, 10_000, '2026-10');
    $budgets->handle($stopped->id, 9_000, '2026-07');
    $budgets->handle($stopped->id, 0, '2026-10');
    $budgets->handle($unused->id, 5_000, '2026-08');
    $budgets->handle($leisure->id, 20_000, '2026-11');

    Ledger::expense($account, 10_000, '2026-09-24', $food);
    Ledger::expense($account, 5_000, '2026-09-25', $food);
    Ledger::expense($account, 30_000, '2026-10-24', $supermarket);
    Ledger::expense($account, 7_000, '2026-10-25', $supermarket);
    Ledger::expense($account, 40_000, '2026-10-01', $housing);
    Ledger::expense($account, 10_001, '2026-10-02', $transport);
    Ledger::expense($account, 12_000, '2026-10-03', $leisure);
    Ledger::expense($account, 3_000, '2026-10-04', $stopped);
    Ledger::income($account, 200_000, '2026-10-01');
    app(DeleteTransaction::class)->handle(Ledger::expense($account, 99_999, '2026-10-05', $food));
    app(RegisterTransfer::class)->handle($account->id, $savings->id, 25_000, day('2026-10-06'));
    app(RecordBalanceAdjustment::class)->handle($account, day('2026-10-07'), Ledger::balance($account, day('2026-10-07')) - 4_000);

    $this->getJson('/api/v1/reports/budget-vs-actual?period=2026-10')
        ->assertOk()
        ->assertExactJson(['data' => [
            'period' => ['label' => '2026-10', 'start' => '2026-09-25', 'end' => '2026-10-24', 'month_start_day' => 25],
            'items' => [
                ['category' => categorySummary($food), 'budget_cents' => 50_000, 'actual_cents' => 35_000, 'remaining_cents' => 15_000, 'used_bp' => 7_000, 'status' => 'ok'],
                ['category' => categorySummary($housing), 'budget_cents' => 50_000, 'actual_cents' => 40_000, 'remaining_cents' => 10_000, 'used_bp' => 8_000, 'status' => 'warning'],
                ['category' => categorySummary($transport), 'budget_cents' => 10_000, 'actual_cents' => 10_001, 'remaining_cents' => -1, 'used_bp' => 10_001, 'status' => 'over'],
                ['category' => categorySummary($unused), 'budget_cents' => 5_000, 'actual_cents' => 0, 'remaining_cents' => 5_000, 'used_bp' => 0, 'status' => 'ok'],
            ],
            'budgeted_cents' => 115_000,
            'actual_budgeted_cents' => 85_001,
            'unbudgeted_actual_cents' => 15_000,
        ]]);

    $this->getJson('/api/v1/reports/budget-vs-actual?period=2026-11')
        ->assertOk()
        ->assertJsonPath('data.period.start', '2026-10-25')
        ->assertJsonPath('data.items.0.actual_cents', 7_000)
        ->assertJsonPath('data.items.*.category.id', [$food->id, $housing->id, $transport->id, $leisure->id, $unused->id]);
});

it('buckets the same spend by calendar month with start day 1', function (): void {
    $food = Category::factory()->create();
    $supermarket = Category::factory()->childOf($food)->create();
    app(SetBudget::class)->handle($food->id, 50_000, '2026-07');

    Ledger::expense($this->account, 5_000, '2026-09-30', $food);
    Ledger::expense($this->account, 30_000, '2026-10-01', $supermarket);
    Ledger::expense($this->account, 7_000, '2026-10-31', $food);
    Ledger::expense($this->account, 1_000, '2026-11-01', $food);

    $this->getJson('/api/v1/reports/budget-vs-actual?period=2026-10')
        ->assertOk()
        ->assertJsonPath('data.period.start', '2026-10-01')
        ->assertJsonPath('data.items.0.actual_cents', 37_000)
        ->assertJsonPath('data.unbudgeted_actual_cents', 0);
});

it('counts spend on archived subcategories and keeps archived budgeted categories out', function (): void {
    $food = Category::factory()->create();
    $archivedChild = Category::factory()->childOf($food)->create();
    $archivedParent = Category::factory()->create();
    app(SetBudget::class)->handle($food->id, 10_000, '2026-10');
    app(SetBudget::class)->handle($archivedParent->id, 10_000, '2026-10');
    $archivedChild->update(['archived_at' => now()]);
    $archivedParent->update(['archived_at' => now()]);

    Ledger::expense($this->account, 4_000, '2026-10-02', $archivedChild);
    Ledger::expense($this->account, 6_000, '2026-10-03', $archivedParent);

    $this->getJson('/api/v1/reports/budget-vs-actual?period=2026-10')
        ->assertOk()
        ->assertJsonPath('data.items.*.category.id', [$food->id])
        ->assertJsonPath('data.items.0.actual_cents', 4_000)
        ->assertJsonPath('data.unbudgeted_actual_cents', 6_000);
});

it('classifies usage with the 80 % and 100 % thresholds', function (int $budget, int $actual, int $usedBp, string $status): void {
    $food = Category::factory()->create();
    app(SetBudget::class)->handle($food->id, $budget, '2026-10');
    Ledger::expense($this->account, $actual, '2026-10-02', $food);

    $this->getJson('/api/v1/reports/budget-vs-actual?period=2026-10')
        ->assertOk()
        ->assertJsonPath('data.items.0.used_bp', $usedBp)
        ->assertJsonPath('data.items.0.status', $status);
})->with([
    'below 80 %' => [10_000, 7_999, 7_999, 'ok'],
    'just below 80 % rounding up' => [1_000_000, 799_999, 8_000, 'ok'],
    'exactly 80 %' => [10_000, 8_000, 8_000, 'warning'],
    'exactly 100 %' => [10_000, 10_000, 10_000, 'warning'],
    'just above 100 % rounding down' => [10_000_000, 10_000_001, 10_000, 'over'],
    'above 100 %' => [10_000, 15_000, 15_000, 'over'],
]);

it('reports an empty comparison without budgets', function (): void {
    Ledger::expense($this->account, 5_000, '2026-10-02');

    $this->getJson('/api/v1/reports/budget-vs-actual')
        ->assertOk()
        ->assertJsonPath('data.period.label', '2026-10')
        ->assertJsonPath('data.items', [])
        ->assertJsonPath('data.budgeted_cents', 0)
        ->assertJsonPath('data.actual_budgeted_cents', 0)
        ->assertJsonPath('data.unbudgeted_actual_cents', 5_000);
});

it('validates the period', function (): void {
    $this->getJson('/api/v1/reports/budget-vs-actual?period=2026-1')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['period']);
});
