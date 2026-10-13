<?php

declare(strict_types=1);

use App\Models\Account;
use App\Models\Transaction;
use App\Models\Transfer;
use App\Models\User;
use Carbon\CarbonImmutable;
use Tests\Support\Ledger;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());

    $this->checking = Account::factory()->openedOn(day('2026-01-01'), 500_000)->create(['name' => 'BBVA']);
    $this->savings = Account::factory()->openedOn(day('2026-01-01'), 0)->create(['name' => 'Ahorro']);
    $this->card = Account::factory()->creditCard(statementDay: 5)->openedOn(day('2026-01-01'))->create(['name' => 'Visa']);
});

function transferPayload(array $overrides = []): array
{
    return [
        'from_account_id' => test()->checking->id,
        'to_account_id' => test()->savings->id,
        'amount_cents' => 10_000,
        'date' => '2026-10-01',
        ...$overrides,
    ];
}

it('moves 100 EUR between accounts without touching net worth or period totals', function (): void {
    Ledger::expense($this->checking, 2_000, '2026-10-02');
    Ledger::income($this->checking, 50_000, '2026-10-03');
    $netWorth = Ledger::netWorth();
    $totals = Ledger::periodTotals('2026-10');

    $response = $this->postJson('/api/v1/transfers', transferPayload(['note' => 'Hucha']))->assertCreated();

    $transfer = Transfer::query()->findOrFail($response->json('data.id'));
    $legs = Transaction::query()->where('transfer_id', $transfer->id)->orderBy('id')->get();

    $response->assertExactJson(['data' => [
        'id' => $transfer->id,
        'kind' => 'transfer',
        'from_account' => ['id' => $this->checking->id, 'name' => 'BBVA', 'type' => 'checking', 'archived' => false],
        'to_account' => ['id' => $this->savings->id, 'name' => 'Ahorro', 'type' => 'checking', 'archived' => false],
        'amount_cents' => 10_000,
        'date' => '2026-10-01',
        'note' => 'Hucha',
        'origin' => 'manual',
        'out_transaction_id' => $legs[0]->id,
        'in_transaction_id' => $legs[1]->id,
        'created_at' => $transfer->created_at?->toIso8601String(),
    ]]);

    expect(Ledger::balance($this->checking))->toBe(500_000 - 2_000 + 50_000 - 10_000)
        ->and(Ledger::balance($this->savings))->toBe(10_000)
        ->and(Ledger::netWorth())->toBe($netWorth)
        ->and(Ledger::periodTotals('2026-10'))->toBe($totals)
        ->and($legs->pluck('amount_cents')->all())->toBe([-10_000, 10_000])
        ->and($legs->pluck('note')->all())->toBe(['Hucha', 'Hucha']);

    $this->artisan('app:ledger:verify')->assertSuccessful();
});

it('defaults the transfer date to today in Madrid', function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 22:30', 'UTC'));

    $this->postJson('/api/v1/transfers', transferPayload(['date' => null]))
        ->assertCreated()->assertJsonPath('data.date', '2026-10-14');
});

it('shows a transfer and 404s once it is deleted', function (): void {
    $id = $this->postJson('/api/v1/transfers', transferPayload())->json('data.id');

    $this->getJson("/api/v1/transfers/{$id}")->assertOk()->assertJsonPath('data.amount_cents', 10_000);

    $this->deleteJson("/api/v1/transfers/{$id}")->assertNoContent();

    $this->getJson("/api/v1/transfers/{$id}")->assertNotFound();
    $this->getJson('/api/v1/transfers/999999')->assertNotFound();
});

it('deleting a transfer restores both balances and restoring it re-applies them', function (): void {
    $transfer = $this->postJson('/api/v1/transfers', transferPayload())->json('data');

    $this->deleteJson("/api/v1/transfers/{$transfer['id']}")->assertNoContent();

    expect(Ledger::balance($this->checking))->toBe(500_000)
        ->and(Ledger::balance($this->savings))->toBe(0)
        ->and(Transaction::query()->where('transfer_id', $transfer['id'])->count())->toBe(0)
        ->and(Transaction::onlyTrashed()->where('transfer_id', $transfer['id'])->count())->toBe(2);

    $this->postJson("/api/v1/transfers/{$transfer['id']}/restore")
        ->assertOk()
        ->assertJsonPath('data.out_transaction_id', $transfer['out_transaction_id'])
        ->assertJsonPath('data.in_transaction_id', $transfer['in_transaction_id']);

    expect(Ledger::balance($this->checking))->toBe(490_000)
        ->and(Ledger::balance($this->savings))->toBe(10_000);

    $this->artisan('app:ledger:verify')->assertSuccessful();
});

it('rewrites both legs in place when the transfer is edited', function (): void {
    $cash = Account::factory()->openedOn(day('2026-01-01'))->create();
    $transfer = $this->postJson('/api/v1/transfers', transferPayload())->json('data');

    $this->patchJson("/api/v1/transfers/{$transfer['id']}", [
        'from_account_id' => $this->savings->id,
        'to_account_id' => $cash->id,
        'amount_cents' => 4_000,
        'date' => '2026-10-05',
        'note' => 'Corregida',
    ])->assertOk()
        ->assertJsonPath('data.from_account.id', $this->savings->id)
        ->assertJsonPath('data.to_account.id', $cash->id)
        ->assertJsonPath('data.amount_cents', 4_000)
        ->assertJsonPath('data.date', '2026-10-05')
        ->assertJsonPath('data.note', 'Corregida')
        ->assertJsonPath('data.out_transaction_id', $transfer['out_transaction_id'])
        ->assertJsonPath('data.in_transaction_id', $transfer['in_transaction_id']);

    $out = Transaction::query()->findOrFail($transfer['out_transaction_id']);
    $in = Transaction::query()->findOrFail($transfer['in_transaction_id']);

    expect([$out->account_id, $out->amount_cents, $out->date->toDateString()])->toBe([$this->savings->id, -4_000, '2026-10-05'])
        ->and([$in->account_id, $in->amount_cents, $in->date->toDateString()])->toBe([$cash->id, 4_000, '2026-10-05'])
        ->and(Ledger::balance($this->checking))->toBe(500_000)
        ->and(Ledger::balance($this->savings))->toBe(-4_000)
        ->and(Ledger::balance($cash))->toBe(4_000);

    $this->artisan('app:ledger:verify')->assertSuccessful();
});

it('swaps the direction of a transfer', function (): void {
    $transfer = $this->postJson('/api/v1/transfers', transferPayload())->json('data');

    $this->patchJson("/api/v1/transfers/{$transfer['id']}", [
        'from_account_id' => $this->savings->id, 'to_account_id' => $this->checking->id,
    ])->assertOk();

    expect(Ledger::balance($this->checking))->toBe(510_000)
        ->and(Ledger::balance($this->savings))->toBe(-10_000);
});

it('allows editing the amount when one side has since been archived', function (): void {
    $transfer = $this->postJson('/api/v1/transfers', transferPayload())->json('data');
    $this->savings->update(['archived_at' => now()]);

    $this->patchJson("/api/v1/transfers/{$transfer['id']}", ['amount_cents' => 2_000])->assertOk();

    expect(Ledger::balance($this->savings))->toBe(2_000);
});

it('validates transfers', function (array $overrides, string $field): void {
    $archived = Account::factory()->openedOn(day('2026-01-01'))->archived()->create();
    $late = Account::factory()->openedOn(day('2026-10-05'))->create();
    $replacements = ['archived' => $archived->id, 'late' => $late->id, 'card' => $this->card->id, 'checking' => $this->checking->id];
    $overrides = array_map(fn (mixed $value): mixed => is_string($value) && isset($replacements[$value]) ? $replacements[$value] : $value, $overrides);

    $this->postJson('/api/v1/transfers', transferPayload($overrides))
        ->assertUnprocessable()
        ->assertJsonValidationErrors([$field]);
})->with([
    'same account' => [['to_account_id' => 'checking'], 'to_account_id'],
    'missing from' => [['from_account_id' => null], 'from_account_id'],
    'missing to' => [['to_account_id' => null], 'to_account_id'],
    'unknown to' => [['to_account_id' => 999_999], 'to_account_id'],
    'archived from' => [['from_account_id' => 'archived'], 'from_account_id'],
    'archived to' => [['to_account_id' => 'archived'], 'to_account_id'],
    'zero amount' => [['amount_cents' => 0], 'amount_cents'],
    'too large' => [['amount_cents' => 10_000_000_000], 'amount_cents'],
    'unknown kind' => [['kind' => 'loan'], 'kind'],
    'date before the destination opened' => [['to_account_id' => 'late'], 'date'],
    'date more than a year ahead' => [['date' => '2027-10-15'], 'date'],
    'settlement to a non-card' => [['kind' => 'card_settlement'], 'to_account_id'],
    'settlement from a card' => [['kind' => 'card_settlement', 'from_account_id' => 'card', 'to_account_id' => 'checking'], 'to_account_id'],
    'unknown draft' => [['draft_id' => 3], 'draft_id'],
]);

it('rejects a card settlement paid from another card', function (): void {
    $otherCard = Account::factory()->creditCard()->openedOn(day('2026-01-01'))->create();

    $this->postJson('/api/v1/transfers', transferPayload([
        'kind' => 'card_settlement', 'from_account_id' => $otherCard->id, 'to_account_id' => $this->card->id,
    ]))->assertUnprocessable()->assertJsonValidationErrors(['from_account_id']);
});

it('validates transfer edits', function (): void {
    $transfer = $this->postJson('/api/v1/transfers', transferPayload())->json('data');
    $archived = Account::factory()->openedOn(day('2026-01-01'))->archived()->create();

    $this->patchJson("/api/v1/transfers/{$transfer['id']}", ['to_account_id' => $this->checking->id])
        ->assertUnprocessable()->assertJsonValidationErrors(['to_account_id']);
    $this->patchJson("/api/v1/transfers/{$transfer['id']}", ['to_account_id' => $archived->id])
        ->assertUnprocessable()->assertJsonValidationErrors(['to_account_id']);
    $this->patchJson("/api/v1/transfers/{$transfer['id']}", ['kind' => 'card_settlement'])
        ->assertUnprocessable()->assertJsonValidationErrors(['to_account_id']);
    $this->patchJson("/api/v1/transfers/{$transfer['id']}", ['amount_cents' => 0])
        ->assertUnprocessable()->assertJsonValidationErrors(['amount_cents']);
    $this->patchJson("/api/v1/transfers/{$transfer['id']}", ['date' => '2025-12-31'])
        ->assertUnprocessable()->assertJsonValidationErrors(['date']);
});

it('converts a transfer into a card settlement', function (): void {
    $transfer = $this->postJson('/api/v1/transfers', transferPayload())->json('data');

    $this->patchJson("/api/v1/transfers/{$transfer['id']}", ['kind' => 'card_settlement', 'to_account_id' => $this->card->id])
        ->assertOk()
        ->assertJsonPath('data.kind', 'card_settlement')
        ->assertJsonPath('data.to_account.type', 'credit_card');
});

it('refuses to restore a transfer onto an archived account', function (): void {
    $transfer = $this->postJson('/api/v1/transfers', transferPayload())->json('data');
    $this->deleteJson("/api/v1/transfers/{$transfer['id']}")->assertNoContent();
    $this->savings->update(['archived_at' => now()]);

    $this->postJson("/api/v1/transfers/{$transfer['id']}/restore")
        ->assertUnprocessable()->assertJsonValidationErrors(['to_account_id']);
});

it('restoring a live transfer is a no-op', function (): void {
    $transfer = $this->postJson('/api/v1/transfers', transferPayload())->json('data');

    $this->postJson("/api/v1/transfers/{$transfer['id']}/restore")->assertOk();

    expect(Ledger::balance($this->savings))->toBe(10_000);
});

it('exposes the transfer block on each leg', function (): void {
    $transfer = $this->postJson('/api/v1/transfers', transferPayload())->json('data');

    $this->getJson("/api/v1/transactions/{$transfer['out_transaction_id']}")
        ->assertOk()
        ->assertJsonPath('data.type', 'transfer')
        ->assertJsonPath('data.category', null)
        ->assertJsonPath('data.signed_amount_cents', -10_000)
        ->assertJsonPath('data.transfer', [
            'id' => $transfer['id'], 'kind' => 'transfer', 'leg' => 'out',
            'counter_account' => ['id' => $this->savings->id, 'name' => 'Ahorro', 'type' => 'checking', 'archived' => false],
        ]);

    $this->getJson("/api/v1/transactions/{$transfer['in_transaction_id']}")
        ->assertOk()
        ->assertJsonPath('data.transfer.leg', 'in')
        ->assertJsonPath('data.transfer.counter_account.id', $this->checking->id);
});
