<?php

declare(strict_types=1);

use App\Actions\Ledger\RecordBalanceAdjustment;
use App\Actions\Transfers\RegisterTransfer;
use App\Enums\AccountType;
use App\Models\Account;
use App\Models\User;
use Carbon\CarbonImmutable;
use Tests\Support\Ledger;
use Tests\Support\Reports;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-11-15 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());
});

it('sums every account balance with cards subtracting and splits assets from liabilities', function (): void {
    $ledger = Reports::goldenLedger();
    $cash = Account::factory()->ofType(AccountType::Cash)->openedOn(day('2026-01-01'), 4_000)->create(['name' => 'Efectivo']);

    $this->getJson('/api/v1/reports/net-worth')
        ->assertOk()
        ->assertExactJson(['data' => [
            'date' => '2026-11-15',
            'total_cents' => 659_000,
            'assets_cents' => 697_000,
            'liabilities_cents' => -38_000,
            'accounts' => [
                ['id' => $ledger['checking']->id, 'name' => 'BBVA', 'type' => 'checking', 'archived' => false, 'balance_cents' => 158_000, 'last_updated_on' => '2026-10-20', 'stale' => false],
                ['id' => $ledger['card']->id, 'name' => 'Visa', 'type' => 'credit_card', 'archived' => false, 'balance_cents' => -38_000, 'last_updated_on' => '2026-10-11', 'stale' => false],
                ['id' => $cash->id, 'name' => 'Efectivo', 'type' => 'cash', 'archived' => false, 'balance_cents' => 4_000, 'last_updated_on' => '2026-01-01', 'stale' => true],
                ['id' => $ledger['savings']->id, 'name' => 'Ahorro', 'type' => 'savings_investment', 'archived' => false, 'balance_cents' => 535_000, 'last_updated_on' => '2026-10-15', 'stale' => true],
            ],
        ]]);
});

it('is unchanged by a transfer and changed by an adjustment', function (): void {
    $checking = Account::factory()->openedOn(day('2026-01-01'), 100_000)->create();
    $savings = Account::factory()->ofType(AccountType::SavingsInvestment)->openedOn(day('2026-01-01'), 50_000)->create();

    $before = $this->getJson('/api/v1/reports/net-worth?date=2026-10-09')->assertOk()->json('data.total_cents');

    app(RegisterTransfer::class)->handle($checking->id, $savings->id, 30_000, day('2026-10-10'));
    $afterTransfer = $this->getJson('/api/v1/reports/net-worth?date=2026-10-10')->assertOk();

    app(RecordBalanceAdjustment::class)->handle($savings, day('2026-10-15'), 85_000);
    $afterAdjustment = $this->getJson('/api/v1/reports/net-worth?date=2026-10-15')->assertOk();

    expect($before)->toBe(150_000)
        ->and($afterTransfer->json('data.total_cents'))->toBe(150_000)
        ->and($afterTransfer->json('data.accounts.1.balance_cents'))->toBe(80_000)
        ->and($afterAdjustment->json('data.total_cents'))->toBe(155_000)
        ->and($afterAdjustment->json('data.accounts.1.last_updated_on'))->toBe('2026-10-15');
});

it('values every account at the requested date', function (): void {
    $card = Account::factory()->creditCard()->openedOn(day('2026-01-01'))->create();
    Ledger::expense($card, 2_500, '2026-10-01');
    Ledger::expense($card, 7_500, '2026-10-20');

    $this->getJson('/api/v1/reports/net-worth?date=2026-10-10')
        ->assertOk()
        ->assertJsonPath('data.date', '2026-10-10')
        ->assertJsonPath('data.total_cents', -2_500)
        ->assertJsonPath('data.assets_cents', 0)
        ->assertJsonPath('data.liabilities_cents', -2_500);
});

it('leaves out accounts opened after the requested date', function (): void {
    $checking = Account::factory()->openedOn(day('2026-01-01'), 100_000)->create();
    Account::factory()->ofType(AccountType::SavingsInvestment)->openedOn(day('2026-09-01'), 500_000)->create();

    $this->getJson('/api/v1/reports/net-worth?date=2026-06-30')
        ->assertOk()
        ->assertJsonPath('data.total_cents', 100_000)
        ->assertJsonPath('data.assets_cents', 100_000)
        ->assertJsonCount(1, 'data.accounts')
        ->assertJsonPath('data.accounts.0.id', $checking->id);
});

it('reports the last update known at the requested date', function (): void {
    $savings = Account::factory()->ofType(AccountType::SavingsInvestment)->openedOn(day('2026-01-01'), 50_000)->create();
    app(RecordBalanceAdjustment::class)->handle($savings, day('2026-01-20'), 55_000);
    app(RecordBalanceAdjustment::class)->handle($savings, day('2026-10-01'), 80_000);
    Ledger::expense($savings, 1_000, '2026-03-01');

    $this->getJson('/api/v1/reports/net-worth?date=2026-01-31')
        ->assertOk()
        ->assertJsonPath('data.total_cents', 55_000)
        ->assertJsonPath('data.accounts.0.last_updated_on', '2026-01-20');
});

it('ignores future-dated movements for the last update and staleness', function (): void {
    $cash = Account::factory()->ofType(AccountType::Cash)->openedOn(day('2026-01-01'), 10_000)->create();
    Ledger::expense($cash, 1_000, '2026-02-01');
    Ledger::expense($cash, 2_000, '2026-12-01');

    $this->getJson('/api/v1/reports/net-worth')
        ->assertOk()
        ->assertJsonPath('data.accounts.0.balance_cents', 9_000)
        ->assertJsonPath('data.accounts.0.last_updated_on', '2026-02-01')
        ->assertJsonPath('data.accounts.0.stale', true);
});

it('includes archived accounts and excludes deleted ones', function (): void {
    $archived = Account::factory()->archived()->openedOn(day('2026-01-01'), 12_000)->create();
    Account::factory()->openedOn(day('2026-01-01'), 99_000)->create()->delete();

    $this->getJson('/api/v1/reports/net-worth')
        ->assertOk()
        ->assertJsonPath('data.total_cents', 12_000)
        ->assertJsonCount(1, 'data.accounts')
        ->assertJsonPath('data.accounts.0.id', $archived->id)
        ->assertJsonPath('data.accounts.0.archived', true);
});

it('flags manually valued accounts as stale only after 30 days without an update', function (): void {
    $fresh = Account::factory()->ofType(AccountType::Cash)->openedOn(day('2026-01-01'))->create(['name' => 'A']);
    $limit = Account::factory()->ofType(AccountType::Cash)->openedOn(day('2026-01-01'))->create(['name' => 'B']);
    Account::factory()->openedOn(day('2026-01-01'))->create(['name' => 'C']);
    Ledger::expense($fresh, 100, '2026-11-01');
    Ledger::expense($limit, 100, '2026-10-16');

    $accounts = collect($this->getJson('/api/v1/reports/net-worth')->assertOk()->json('data.accounts'))->keyBy('name');

    expect($accounts['A']['stale'])->toBeFalse()
        ->and($accounts['B']['stale'])->toBeFalse()
        ->and($accounts['C']['stale'])->toBeFalse()
        ->and($accounts['C']['last_updated_on'])->toBe('2026-01-01');
});

it('returns zero totals without accounts', function (): void {
    $this->getJson('/api/v1/reports/net-worth')
        ->assertOk()
        ->assertJsonPath('data.total_cents', 0)
        ->assertJsonPath('data.assets_cents', 0)
        ->assertJsonPath('data.liabilities_cents', 0)
        ->assertJsonPath('data.accounts', []);
});

it('validates the date', function (): void {
    $this->getJson('/api/v1/reports/net-worth?date=2026-02-30')->assertUnprocessable()->assertJsonValidationErrors('date');
});
