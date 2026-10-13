<?php

declare(strict_types=1);

use App\Actions\Transfers\SettleCreditCard;
use App\Enums\TransferKind;
use App\Models\Account;
use App\Models\Category;
use App\Models\Setting;
use App\Models\User;
use Carbon\CarbonImmutable;
use Tests\Support\Ledger;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-10 12:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());

    $this->checking = Account::factory()->openedOn(day('2026-01-01'), 300_000)->create(['name' => 'BBVA']);
    $this->card = Account::factory()->creditCard(statementDay: 5, settlementAccountId: $this->checking->id)
        ->openedOn(day('2026-01-01'))
        ->create(['name' => 'Visa']);
    $this->groceries = Category::factory()->create();
});

it('settles a deferred-debit card so the purchase counts once as expense', function (): void {
    $this->postJson('/api/v1/transactions', [
        'type' => 'expense', 'amount_cents' => 10_000, 'date' => '2026-10-03',
        'account_id' => $this->card->id, 'category_id' => $this->groceries->id,
    ])->assertCreated();

    $this->getJson("/api/v1/accounts/{$this->card->id}/settlement-suggestion?date=2026-10-10")
        ->assertOk()
        ->assertExactJson(['data' => [
            'card_account_id' => $this->card->id,
            'statement_start' => '2026-09-06',
            'statement_end' => '2026-10-05',
            'statement_balance_cents' => -10_000,
            'settled_since_cents' => 0,
            'suggested_cents' => 10_000,
            'from_account_id' => $this->checking->id,
        ]]);

    $this->postJson('/api/v1/transfers', [
        'kind' => 'card_settlement', 'from_account_id' => $this->checking->id, 'to_account_id' => $this->card->id,
        'amount_cents' => 10_000, 'date' => '2026-10-10',
    ])->assertCreated()->assertJsonPath('data.kind', 'card_settlement');

    expect(Ledger::balance($this->card))->toBe(0)
        ->and(Ledger::balance($this->checking))->toBe(290_000)
        ->and(Ledger::periodTotals('2026-10'))->toBe(['income_cents' => 0, 'expense_cents' => 10_000]);

    $this->getJson('/api/v1/transactions?type[]=expense')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('meta.totals', ['income_cents' => 0, 'expense_cents' => 10_000]);

    $this->getJson('/api/v1/transactions?period=2026-10')
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('meta.totals.expense_cents', 10_000);

    $this->getJson("/api/v1/accounts/{$this->card->id}/settlement-suggestion?date=2026-10-10")
        ->assertOk()
        ->assertJsonPath('data.statement_balance_cents', -10_000)
        ->assertJsonPath('data.settled_since_cents', 10_000)
        ->assertJsonPath('data.suggested_cents', 0);
});

it('excludes purchases made after the statement closed', function (): void {
    Ledger::expense($this->card, 4_000, '2026-09-20', $this->groceries);
    Ledger::expense($this->card, 6_000, '2026-10-07', $this->groceries);

    $this->getJson("/api/v1/accounts/{$this->card->id}/settlement-suggestion?date=2026-10-10")
        ->assertOk()
        ->assertJsonPath('data.statement_balance_cents', -4_000)
        ->assertJsonPath('data.suggested_cents', 4_000);
});

it('counts movements dated on the statement day inside the closed statement only', function (): void {
    Ledger::expense($this->card, 10_000, '2026-10-05', $this->groceries);
    app(SettleCreditCard::class)->handle($this->card->id, $this->checking->id, 4_000, day('2026-10-05'));

    $this->getJson("/api/v1/accounts/{$this->card->id}/settlement-suggestion?date=2026-10-10")
        ->assertOk()
        ->assertJsonPath('data.statement_end', '2026-10-05')
        ->assertJsonPath('data.statement_balance_cents', -6_000)
        ->assertJsonPath('data.settled_since_cents', 0)
        ->assertJsonPath('data.suggested_cents', 6_000);
});

it('subtracts partial settlements made since the statement closed', function (): void {
    Ledger::expense($this->card, 30_000, '2026-09-20', $this->groceries);
    app(SettleCreditCard::class)->handle($this->card->id, $this->checking->id, 12_000, day('2026-10-06'));
    app(SettleCreditCard::class)->handle($this->card->id, $this->checking->id, 1_000, day('2026-10-11'));

    $this->getJson("/api/v1/accounts/{$this->card->id}/settlement-suggestion?date=2026-10-10")
        ->assertOk()
        ->assertJsonPath('data.settled_since_cents', 12_000)
        ->assertJsonPath('data.suggested_cents', 18_000);
});

it('stops subtracting a settlement once it is deleted', function (): void {
    Ledger::expense($this->card, 30_000, '2026-09-20', $this->groceries);
    $settlement = app(SettleCreditCard::class)->handle($this->card->id, $this->checking->id, 12_000, day('2026-10-06'));

    $this->deleteJson("/api/v1/transfers/{$settlement->id}")->assertNoContent();

    $this->getJson("/api/v1/accounts/{$this->card->id}/settlement-suggestion?date=2026-10-10")
        ->assertOk()
        ->assertJsonPath('data.settled_since_cents', 0)
        ->assertJsonPath('data.suggested_cents', 30_000);
});

it('ignores plain transfers into the card when suggesting a settlement', function (): void {
    Ledger::expense($this->card, 30_000, '2026-09-20', $this->groceries);

    $this->postJson('/api/v1/transfers', [
        'kind' => 'transfer', 'from_account_id' => $this->checking->id, 'to_account_id' => $this->card->id,
        'amount_cents' => 5_000, 'date' => '2026-10-07',
    ])->assertCreated()->assertJsonPath('data.kind', 'transfer');

    $this->getJson("/api/v1/accounts/{$this->card->id}/settlement-suggestion?date=2026-10-10")
        ->assertOk()
        ->assertJsonPath('data.settled_since_cents', 0)
        ->assertJsonPath('data.suggested_cents', 30_000);
});

it('uses the statement of the same day when the date is the statement day', function (): void {
    $this->getJson("/api/v1/accounts/{$this->card->id}/settlement-suggestion?date=2026-10-05")
        ->assertOk()
        ->assertJsonPath('data.statement_start', '2026-09-06')
        ->assertJsonPath('data.statement_end', '2026-10-05');

    $this->getJson("/api/v1/accounts/{$this->card->id}/settlement-suggestion?date=2026-01-04")
        ->assertOk()
        ->assertJsonPath('data.statement_start', '2025-11-06')
        ->assertJsonPath('data.statement_end', '2025-12-05');
});

it('defaults the suggestion date to today', function (): void {
    $this->getJson("/api/v1/accounts/{$this->card->id}/settlement-suggestion")
        ->assertOk()
        ->assertJsonPath('data.statement_end', '2026-10-05');
});

it('suggests the whole debt for a card without statement day', function (): void {
    $card = Account::factory()->creditCard()->openedOn(day('2026-01-01'), -5_000)->create();
    Setting::current()->update(['default_account_id' => $this->checking->id]);
    Ledger::expense($card, 2_000, '2026-10-09', $this->groceries);
    Ledger::expense($card, 9_000, '2026-10-12', $this->groceries);

    $this->getJson("/api/v1/accounts/{$card->id}/settlement-suggestion?date=2026-10-10")
        ->assertOk()
        ->assertExactJson(['data' => [
            'card_account_id' => $card->id,
            'statement_start' => null,
            'statement_end' => null,
            'statement_balance_cents' => -7_000,
            'settled_since_cents' => 0,
            'suggested_cents' => 7_000,
            'from_account_id' => $this->checking->id,
        ]]);
});

it('never suggests a negative amount for a card in credit', function (): void {
    $card = Account::factory()->creditCard(statementDay: 5)->openedOn(day('2026-01-01'), 2_000)->create();

    $this->getJson("/api/v1/accounts/{$card->id}/settlement-suggestion")
        ->assertOk()
        ->assertJsonPath('data.suggested_cents', 0)
        ->assertJsonPath('data.from_account_id', null);
});

it('rejects a suggestion for an account that is not a card', function (): void {
    $this->getJson("/api/v1/accounts/{$this->checking->id}/settlement-suggestion")
        ->assertConflict()
        ->assertExactJson(['message' => 'La cuenta no es una tarjeta de crédito.', 'code' => 'not_a_credit_card']);
});

it('validates the suggestion date', function (): void {
    $this->getJson("/api/v1/accounts/{$this->card->id}/settlement-suggestion?date=10-10-2026")
        ->assertUnprocessable()->assertJsonValidationErrors(['date']);
});

it('settles through the action with the card settlement kind', function (): void {
    $transfer = app(SettleCreditCard::class)->handle($this->card->id, $this->checking->id, 2_500);

    expect($transfer->kind)->toBe(TransferKind::CardSettlement)
        ->and($transfer->date->toDateString())->toBe('2026-10-10')
        ->and(Ledger::balance($this->card))->toBe(2_500);
});
