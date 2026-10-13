<?php

declare(strict_types=1);

use App\Enums\AccountType;
use App\Models\Account;
use App\Models\Setting;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Tests\Support\RawLedger;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());
});

it('creates every account type and returns the full shape', function (string $type, array $extra): void {
    $response = $this->postJson('/api/v1/accounts', [
        'name' => "Cuenta {$type}",
        'type' => $type,
        'opening_balance_cents' => -12_000,
        'opening_date' => '2026-10-01',
        ...$extra,
    ])->assertCreated();

    $id = $response->json('data.id');

    $response->assertExactJson(['data' => [
        'id' => $id,
        'name' => "Cuenta {$type}",
        'type' => $type,
        'opening_balance_cents' => -12_000,
        'opening_date' => '2026-10-01',
        'statement_day' => $extra['statement_day'] ?? null,
        'settlement_account_id' => null,
        'sort_order' => 0,
        'archived_at' => null,
        'balance_cents' => -12_000,
        'last_movement_date' => null,
        'last_adjustment_date' => null,
        'last_updated_on' => '2026-10-01',
        'stale' => false,
        'created_at' => Account::query()->findOrFail($id)->created_at?->toIso8601String(),
    ]]);
})->with([
    ['checking', []],
    ['cash', []],
    ['credit_card', ['statement_day' => 5]],
    ['savings_investment', []],
]);

it('creates a card that settles from a checking account', function (): void {
    $checking = Account::factory()->create();

    $this->postJson('/api/v1/accounts', [
        'name' => 'Visa', 'type' => 'credit_card', 'opening_date' => '2026-10-01',
        'statement_day' => 5, 'settlement_account_id' => $checking->id,
    ])->assertCreated()->assertJsonPath('data.settlement_account_id', $checking->id);
});

it('validates account creation', function (array $payload, string $field): void {
    Account::factory()->create(['name' => 'BBVA']);
    $card = Account::factory()->creditCard()->create();

    $payload = array_map(fn ($value) => $value === 'card' ? $card->id : $value, $payload);

    $this->postJson('/api/v1/accounts', [
        'name' => 'Nueva', 'type' => 'checking', 'opening_date' => '2026-10-01', ...$payload,
    ])->assertUnprocessable()->assertJsonValidationErrors([$field]);
})->with([
    'missing name' => [['name' => ''], 'name'],
    'long name' => [['name' => str_repeat('a', 81)], 'name'],
    'duplicate name ignoring case' => [['name' => 'bbva'], 'name'],
    'unknown type' => [['type' => 'wallet'], 'type'],
    'decimal opening balance' => [['opening_balance_cents' => 12.5], 'opening_balance_cents'],
    'opening balance too large' => [['opening_balance_cents' => 10_000_000_000], 'opening_balance_cents'],
    'future opening date' => [['opening_date' => '2026-10-14'], 'opening_date'],
    'malformed opening date' => [['opening_date' => '01/10/2026'], 'opening_date'],
    'statement day on checking' => [['statement_day' => 5], 'statement_day'],
    'settlement account on cash' => [['type' => 'cash', 'settlement_account_id' => 1], 'settlement_account_id'],
    'statement day out of range' => [['type' => 'credit_card', 'statement_day' => 29], 'statement_day'],
    'card settling into a card' => [['type' => 'credit_card', 'settlement_account_id' => 'card'], 'settlement_account_id'],
    'unknown settlement account' => [['type' => 'credit_card', 'settlement_account_id' => 999_999], 'settlement_account_id'],
]);

it('lists live accounts with balances and hides archived ones by default', function (): void {
    $checking = Account::factory()->openedOn(day('2026-01-01'), 150_000)->create(['name' => 'BBVA']);
    $archived = Account::factory()->archived()->create(['name' => 'Antigua']);
    $deleted = Account::factory()->create(['name' => 'Borrada']);
    $deleted->delete();
    Transaction::factory()->on($checking, day('2026-10-12'))->expense(2_350)->create();

    $this->getJson('/api/v1/accounts')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $checking->id)
        ->assertJsonPath('data.0.balance_cents', 147_650)
        ->assertJsonPath('data.0.last_movement_date', '2026-10-12')
        ->assertJsonPath('data.0.last_updated_on', '2026-10-12');

    $this->getJson('/api/v1/accounts?include_archived=1')
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonFragment(['id' => $archived->id, 'name' => 'Antigua']);
});

it('orders accounts by type, sort order and name', function (): void {
    $savings = Account::factory()->ofType(AccountType::SavingsInvestment)->create(['name' => 'Ahorro']);
    $checkingB = Account::factory()->create(['name' => 'Bankinter', 'sort_order' => 1]);
    $checkingA = Account::factory()->create(['name' => 'abanca', 'sort_order' => 1]);
    $checkingFirst = Account::factory()->create(['name' => 'Zeta', 'sort_order' => 0]);
    $cash = Account::factory()->ofType(AccountType::Cash)->create(['name' => 'Cartera']);

    $ids = $this->getJson('/api/v1/accounts')->assertOk()->json('data.*.id');

    expect($ids)->toBe([$checkingFirst->id, $checkingA->id, $checkingB->id, $cash->id, $savings->id]);
});

it('flags stale cash accounts', function (): void {
    $cash = Account::factory()->ofType(AccountType::Cash)->openedOn(day('2026-08-01'))->create();

    $this->getJson("/api/v1/accounts/{$cash->id}")
        ->assertOk()
        ->assertJsonPath('data.last_updated_on', '2026-08-01')
        ->assertJsonPath('data.stale', true);
});

it('shows an account and hides soft-deleted ones', function (): void {
    $account = Account::factory()->create();
    $deleted = Account::factory()->create();
    $deleted->delete();

    $this->getJson("/api/v1/accounts/{$account->id}")->assertOk()->assertJsonPath('data.id', $account->id);
    $this->getJson("/api/v1/accounts/{$deleted->id}")->assertNotFound();
    $this->getJson('/api/v1/accounts/999999')->assertNotFound();
});

it('edits an account', function (): void {
    $account = Account::factory()->creditCard(statementDay: 5)->create(['name' => 'Visa']);

    $this->patchJson("/api/v1/accounts/{$account->id}", ['name' => 'Visa Oro', 'statement_day' => 10, 'sort_order' => 3])
        ->assertOk()
        ->assertJsonPath('data.name', 'Visa Oro')
        ->assertJsonPath('data.statement_day', 10)
        ->assertJsonPath('data.sort_order', 3);
});

it('keeps its own name when editing other fields', function (): void {
    $account = Account::factory()->create(['name' => 'BBVA']);

    $this->patchJson("/api/v1/accounts/{$account->id}", ['name' => 'bbva'])->assertOk()->assertJsonPath('data.name', 'bbva');
});

it('rejects a type change once the account has movements', function (): void {
    $account = Account::factory()->create();
    Transaction::factory()->on($account)->expense(100)->create();

    $this->patchJson("/api/v1/accounts/{$account->id}", ['type' => 'cash'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['type']);
});

it('rejects a type change when the account only has soft-deleted movements', function (): void {
    $account = Account::factory()->create();
    Transaction::factory()->on($account)->expense(100)->create()->delete();

    $this->patchJson("/api/v1/accounts/{$account->id}", ['type' => 'cash'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['type']);

    expect($account->refresh()->type)->toBe(AccountType::Checking);
});

it('rejects an archived settlement account on card creation and edit', function (): void {
    $archived = Account::factory()->archived()->create();
    $card = Account::factory()->creditCard(5)->create();

    $this->postJson('/api/v1/accounts', [
        'name' => 'Visa', 'type' => 'credit_card', 'opening_date' => '2026-10-01',
        'statement_day' => 5, 'settlement_account_id' => $archived->id,
    ])->assertUnprocessable()->assertJsonValidationErrors(['settlement_account_id']);

    $this->patchJson("/api/v1/accounts/{$card->id}", ['settlement_account_id' => $archived->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['settlement_account_id']);
});

it('clears the card settlement account when that account is archived', function (): void {
    $checking = Account::factory()->create();
    $card = Account::factory()->creditCard(5, $checking->id)->create();

    $this->postJson("/api/v1/accounts/{$checking->id}/archive")->assertOk();

    expect($card->refresh()->settlement_account_id)->toBeNull();
});

it('clears the card settlement account when that account is deleted', function (): void {
    $checking = Account::factory()->create();
    $card = Account::factory()->creditCard(5, $checking->id)->create();

    $this->deleteJson("/api/v1/accounts/{$checking->id}")->assertNoContent();

    expect($card->refresh()->settlement_account_id)->toBeNull();
});

it('rejects card fields when editing a non-card account', function (): void {
    $account = Account::factory()->create();

    $this->patchJson("/api/v1/accounts/{$account->id}", ['statement_day' => 5])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['statement_day']);
});

it('returns 409 when the opening date moves after existing movements', function (): void {
    $account = Account::factory()->openedOn(day('2026-01-01'))->create();
    Transaction::factory()->on($account, day('2026-03-01'))->expense(100)->create();

    $this->patchJson("/api/v1/accounts/{$account->id}", ['opening_date' => '2026-04-01'])
        ->assertConflict()
        ->assertJsonPath('code', 'opening_date_after_movements');
});

it('deletes an account without movements', function (): void {
    $account = Account::factory()->create();

    $this->deleteJson("/api/v1/accounts/{$account->id}")->assertNoContent();
    $this->getJson("/api/v1/accounts/{$account->id}")->assertNotFound();
});

it('returns 409 when deleting an account with movements but lets it be archived', function (): void {
    $account = Account::factory()->create();
    Transaction::factory()->on($account)->expense(100)->create();

    $this->deleteJson("/api/v1/accounts/{$account->id}")
        ->assertConflict()
        ->assertJson(['code' => 'account_has_movements']);

    $this->postJson("/api/v1/accounts/{$account->id}/archive")
        ->assertOk()
        ->assertJsonPath('data.id', $account->id)
        ->assertJsonPath('data.archived_at', fn (?string $value) => $value !== null);
});

it('archives and unarchives an account and clears the settings pointers', function (): void {
    $account = Account::factory()->create();
    Setting::current()->update(['default_account_id' => $account->id, 'last_used_account_id' => $account->id]);

    $this->postJson("/api/v1/accounts/{$account->id}/archive")->assertOk();

    expect(Setting::current()->default_account_id)->toBeNull()
        ->and(Setting::current()->last_used_account_id)->toBeNull();

    $this->getJson('/api/v1/accounts')->assertJsonCount(0, 'data');

    $this->postJson("/api/v1/accounts/{$account->id}/unarchive")
        ->assertOk()
        ->assertJsonPath('data.archived_at', null);

    $this->getJson('/api/v1/accounts')->assertJsonCount(1, 'data');
});

it('returns the balance at a date', function (): void {
    $account = Account::factory()->openedOn(day('2026-01-01'), 100_000)->create();
    Transaction::factory()->on($account, day('2026-09-15'))->expense(20_000)->create();
    Transaction::factory()->on($account, day('2026-10-20'))->expense(5_000)->create();

    $this->getJson("/api/v1/accounts/{$account->id}/balance")
        ->assertOk()
        ->assertExactJson(['data' => ['account_id' => $account->id, 'date' => '2026-10-13', 'balance_cents' => 80_000]]);

    $this->getJson("/api/v1/accounts/{$account->id}/balance?date=2026-09-01")
        ->assertOk()
        ->assertJsonPath('data.balance_cents', 100_000);

    $this->getJson("/api/v1/accounts/{$account->id}/balance?date=2026-10-31")
        ->assertOk()
        ->assertJsonPath('data.balance_cents', 75_000);

    $this->getJson("/api/v1/accounts/{$account->id}/balance?date=31-10-2026")
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['date']);
});

it('counts transfers in balances', function (): void {
    $checking = Account::factory()->openedOn(day('2026-01-01'), 100_000)->create();
    $savings = Account::factory()->ofType(AccountType::SavingsInvestment)->openedOn(day('2026-01-01'))->create();
    RawLedger::balancedTransfer($checking->id, $savings->id, 10_000, '2026-10-01');

    $this->getJson('/api/v1/accounts')
        ->assertJsonPath('data.0.balance_cents', 90_000)
        ->assertJsonPath('data.1.balance_cents', 10_000);
});

it('records an adjustment that reaches the target balance', function (): void {
    $account = Account::factory()->ofType(AccountType::SavingsInvestment)->openedOn(day('2026-01-01'), 1_000_000)->create();

    $response = $this->postJson("/api/v1/accounts/{$account->id}/adjustments", [
        'date' => '2026-10-13', 'target_balance_cents' => 1_250_000, 'note' => 'Valor cartera',
    ])->assertCreated();

    $transaction = Transaction::query()->findOrFail($response->json('data.id'));

    $response->assertExactJson(['data' => [
        'id' => $transaction->id,
        'type' => 'adjustment',
        'account' => ['id' => $account->id, 'name' => $account->name, 'type' => 'savings_investment', 'archived' => false],
        'amount_cents' => 250_000,
        'signed_amount_cents' => 250_000,
        'date' => '2026-10-13',
        'category' => null,
        'description' => null,
        'merchant' => null,
        'note' => 'Valor cartera',
        'origin' => 'manual',
        'tags' => [],
        'transfer' => null,
        'adjustment_target_cents' => 1_250_000,
        'recurring_template_id' => null,
        'attachments_count' => 0,
        'created_at' => $transaction->created_at?->toIso8601String(),
        'updated_at' => $transaction->updated_at?->toIso8601String(),
    ]]);

    $this->getJson("/api/v1/accounts/{$account->id}")
        ->assertJsonPath('data.balance_cents', 1_250_000)
        ->assertJsonPath('data.last_adjustment_date', '2026-10-13')
        ->assertJsonPath('data.last_updated_on', '2026-10-13')
        ->assertJsonPath('data.stale', false);
});

it('reports a negative delta as a negative signed amount', function (): void {
    $account = Account::factory()->openedOn(day('2026-01-01'), 50_000)->create();

    $this->postJson("/api/v1/accounts/{$account->id}/adjustments", ['date' => '2026-10-01', 'target_balance_cents' => 45_000])
        ->assertCreated()
        ->assertJsonPath('data.amount_cents', 5_000)
        ->assertJsonPath('data.signed_amount_cents', -5_000);
});

it('rejects invalid adjustments', function (array $payload, string $field): void {
    $account = Account::factory()->openedOn(day('2026-01-01'), 50_000)->create();

    $this->postJson("/api/v1/accounts/{$account->id}/adjustments", ['date' => '2026-10-01', 'target_balance_cents' => 1, ...$payload])
        ->assertUnprocessable()
        ->assertJsonValidationErrors([$field]);
})->with([
    'zero delta' => [['target_balance_cents' => 50_000], 'target_balance_cents'],
    'missing target' => [['target_balance_cents' => null], 'target_balance_cents'],
    'future date' => [['date' => '2026-10-14'], 'date'],
    'before opening date' => [['date' => '2025-12-31'], 'date'],
    'missing date' => [['date' => null], 'date'],
]);

it('rejects adjustments on archived accounts', function (): void {
    $account = Account::factory()->archived()->create();

    $this->postJson("/api/v1/accounts/{$account->id}/adjustments", ['date' => '2026-10-01', 'target_balance_cents' => 1])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['account_id']);
});
