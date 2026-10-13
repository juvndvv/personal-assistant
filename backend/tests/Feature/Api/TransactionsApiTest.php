<?php

declare(strict_types=1);

use App\Enums\AccountType;
use App\Models\Account;
use App\Models\Category;
use App\Models\Setting;
use App\Models\Tag;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Tests\Support\Ledger;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());

    $this->checking = Account::factory()->openedOn(day('2026-01-01'), 100_000)->create(['name' => 'BBVA']);
    $this->groceries = Category::factory()->create(['name' => 'Supermercado']);
    $this->salary = Category::factory()->income()->create(['name' => 'Nómina']);
});

describe('POST /transactions', function (): void {
    it('saves an expense with only type, amount and category using the defaults', function (): void {
        $card = Account::factory()->creditCard()->openedOn(day('2026-01-01'))->create(['name' => 'Visa']);
        Setting::current()->update(['default_account_id' => $this->checking->id, 'last_used_account_id' => $card->id]);

        $response = $this->postJson('/api/v1/transactions', [
            'type' => 'expense',
            'amount_cents' => 2_350,
            'category_id' => $this->groceries->id,
        ])->assertCreated();

        $transaction = Transaction::query()->findOrFail($response->json('data.id'));

        $response->assertExactJson(['data' => [
            'id' => $transaction->id,
            'type' => 'expense',
            'account' => ['id' => $card->id, 'name' => 'Visa', 'type' => 'credit_card', 'archived' => false],
            'amount_cents' => 2_350,
            'signed_amount_cents' => -2_350,
            'date' => '2026-10-13',
            'category' => ['id' => $this->groceries->id, 'name' => 'Supermercado', 'kind' => 'expense', 'parent_id' => null, 'parent_name' => null],
            'description' => null,
            'merchant' => null,
            'note' => null,
            'origin' => 'manual',
            'tags' => [],
            'transfer' => null,
            'adjustment_target_cents' => null,
            'recurring_template_id' => null,
            'attachments_count' => 0,
            'created_at' => $transaction->created_at?->toIso8601String(),
            'updated_at' => $transaction->updated_at?->toIso8601String(),
        ]]);

        expect(Ledger::balance($card))->toBe(-2_350);
    });

    it('stores income with a positive sign and remembers the account as last used', function (): void {
        $this->postJson('/api/v1/transactions', [
            'type' => 'income',
            'amount_cents' => 210_000,
            'date' => '2026-10-01',
            'account_id' => $this->checking->id,
            'category_id' => $this->salary->id,
            'description' => '  Nómina octubre ',
            'merchant' => 'ACME',
            'note' => 'Con extra',
        ])->assertCreated()
            ->assertJsonPath('data.signed_amount_cents', 210_000)
            ->assertJsonPath('data.amount_cents', 210_000)
            ->assertJsonPath('data.date', '2026-10-01')
            ->assertJsonPath('data.description', 'Nómina octubre')
            ->assertJsonPath('data.merchant', 'ACME')
            ->assertJsonPath('data.note', 'Con extra');

        expect(Setting::current()->last_used_account_id)->toBe($this->checking->id)
            ->and(Ledger::balance($this->checking))->toBe(310_000);
    });

    it('defaults the date to the Madrid calendar day just after midnight', function (): void {
        $this->travelTo(CarbonImmutable::parse('2026-10-13 22:30', 'UTC'));

        $this->postJson('/api/v1/transactions', [
            'type' => 'expense', 'amount_cents' => 500, 'category_id' => $this->groceries->id,
        ])->assertCreated()->assertJsonPath('data.date', '2026-10-14');

        $this->getJson('/api/v1/quick-add/defaults')->assertOk()->assertJsonPath('data.date', '2026-10-14');
    });

    it('falls back to the default account and then to the first writable account', function (): void {
        $savings = Account::factory()->ofType(AccountType::SavingsInvestment)->openedOn(day('2026-01-01'))->create();
        $archived = Account::factory()->openedOn(day('2026-01-01'))->archived()->create();
        Setting::current()->update(['default_account_id' => $savings->id, 'last_used_account_id' => $archived->id]);

        $this->postJson('/api/v1/transactions', ['type' => 'expense', 'amount_cents' => 100, 'category_id' => $this->groceries->id])
            ->assertCreated()->assertJsonPath('data.account.id', $savings->id);

        Setting::current()->update(['default_account_id' => null, 'last_used_account_id' => null]);

        $this->postJson('/api/v1/transactions', ['type' => 'expense', 'amount_cents' => 100, 'category_id' => $this->groceries->id])
            ->assertCreated()->assertJsonPath('data.account.id', $this->checking->id);
    });

    it('rejects a transaction when there is no writable account at all', function (): void {
        $this->checking->update(['archived_at' => now()]);

        $this->postJson('/api/v1/transactions', ['type' => 'expense', 'amount_cents' => 100, 'category_id' => $this->groceries->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['account_id']);
    });

    it('finds or creates tags case-insensitively', function (): void {
        $existing = Tag::query()->create(['name' => 'casa']);

        $response = $this->postJson('/api/v1/transactions', [
            'type' => 'expense', 'amount_cents' => 100, 'category_id' => $this->groceries->id,
            'tags' => ['  CASA ', 'Viaje  Roma', 'viaje roma'],
        ])->assertCreated();

        $created = Tag::query()->where('name', 'viaje roma')->firstOrFail();

        expect($response->json('data.tags'))->toBe([
            ['id' => $existing->id, 'name' => 'casa'],
            ['id' => $created->id, 'name' => 'viaje roma'],
        ])->and(Tag::query()->count())->toBe(2);
    });

    it('validates the payload', function (array $payload, string $field): void {
        $archived = Account::factory()->openedOn(day('2026-01-01'))->archived()->create();
        $late = Account::factory()->openedOn(day('2026-10-01'))->create();
        $archivedCategory = Category::factory()->archived()->create();
        $parent = Category::factory()->archived()->create();
        $childOfArchived = Category::factory()->childOf($parent)->create();

        $replacements = [
            'archived' => $archived->id, 'late' => $late->id, 'income_category' => $this->salary->id,
            'archived_category' => $archivedCategory->id, 'child_of_archived' => $childOfArchived->id,
        ];
        $payload = array_map(fn (mixed $value): mixed => is_string($value) && isset($replacements[$value]) ? $replacements[$value] : $value, $payload);

        $this->postJson('/api/v1/transactions', [
            'type' => 'expense', 'amount_cents' => 100, 'category_id' => $this->groceries->id, 'account_id' => $this->checking->id,
            ...$payload,
        ])->assertUnprocessable()->assertJsonValidationErrors([$field]);
    })->with([
        'missing type' => [['type' => null], 'type'],
        'transfer type' => [['type' => 'transfer'], 'type'],
        'adjustment type' => [['type' => 'adjustment'], 'type'],
        'zero amount' => [['amount_cents' => 0], 'amount_cents'],
        'negative amount' => [['amount_cents' => -100], 'amount_cents'],
        'decimal amount' => [['amount_cents' => 12.5], 'amount_cents'],
        'amount too large' => [['amount_cents' => 10_000_000_000], 'amount_cents'],
        'malformed date' => [['date' => '13/10/2026'], 'date'],
        'date before opening' => [['account_id' => 'late', 'date' => '2026-09-30'], 'date'],
        'date beyond a year ahead' => [['date' => '2027-10-15'], 'date'],
        'unknown account' => [['account_id' => 999_999], 'account_id'],
        'archived account' => [['account_id' => 'archived'], 'account_id'],
        'missing category' => [['category_id' => null], 'category_id'],
        'unknown category' => [['category_id' => 999_999], 'category_id'],
        'category of the other kind' => [['category_id' => 'income_category'], 'category_id'],
        'archived category' => [['category_id' => 'archived_category'], 'category_id'],
        'child of an archived category' => [['category_id' => 'child_of_archived'], 'category_id'],
        'long description' => [['description' => str_repeat('a', 256)], 'description'],
        'long merchant' => [['merchant' => str_repeat('a', 121)], 'merchant'],
        'tags not an array' => [['tags' => 'casa'], 'tags'],
        'too many tags' => [['tags' => range(1, 11)], 'tags'],
        'blank tag' => [['tags' => ['   ']], 'tags.0'],
        'long tag' => [['tags' => [str_repeat('a', 41)]], 'tags.0'],
        'draft before drafts exist' => [['draft_id' => 5], 'draft_id'],
    ]);

    it('accepts a date up to 366 days ahead', function (): void {
        $this->postJson('/api/v1/transactions', [
            'type' => 'expense', 'amount_cents' => 100, 'category_id' => $this->groceries->id, 'date' => '2027-10-14',
        ])->assertCreated();
    });
});

describe('GET /transactions/{id}', function (): void {
    it('shows a transaction with its tags and subcategory', function (): void {
        $food = Category::factory()->create(['name' => 'Alimentación']);
        $sub = Category::factory()->childOf($food)->create(['name' => 'Fruta']);
        $transaction = Ledger::expense($this->checking, 1_000, '2026-10-10', $sub);
        $transaction->tags()->attach(Tag::query()->create(['name' => 'casa']));

        $this->getJson("/api/v1/transactions/{$transaction->id}")
            ->assertOk()
            ->assertJsonPath('data.category', ['id' => $sub->id, 'name' => 'Fruta', 'kind' => 'expense', 'parent_id' => $food->id, 'parent_name' => 'Alimentación'])
            ->assertJsonPath('data.tags.0.name', 'casa');
    });

    it('returns 404 for unknown or deleted transactions', function (): void {
        $transaction = Ledger::expense($this->checking, 1_000, '2026-10-10');
        $transaction->delete();

        $this->getJson("/api/v1/transactions/{$transaction->id}")->assertNotFound();
        $this->getJson('/api/v1/transactions/999999')->assertNotFound();
    });
});

describe('PATCH /transactions/{id}', function (): void {
    it('edits the fields of an expense', function (): void {
        $savings = Account::factory()->openedOn(day('2026-01-01'))->create();
        $other = Category::factory()->create();
        $transaction = Ledger::expense($this->checking, 1_000, '2026-10-10', $this->groceries, ['description' => 'Antes', 'note' => 'nota']);

        $this->patchJson("/api/v1/transactions/{$transaction->id}", [
            'amount_cents' => 2_500, 'date' => '2026-10-11', 'account_id' => $savings->id, 'category_id' => $other->id,
            'description' => 'Después', 'note' => null, 'merchant' => 'Mercadona',
        ])->assertOk()
            ->assertJsonPath('data.signed_amount_cents', -2_500)
            ->assertJsonPath('data.date', '2026-10-11')
            ->assertJsonPath('data.account.id', $savings->id)
            ->assertJsonPath('data.category.id', $other->id)
            ->assertJsonPath('data.description', 'Después')
            ->assertJsonPath('data.merchant', 'Mercadona')
            ->assertJsonPath('data.note', null);

        expect(Ledger::balance($this->checking))->toBe(100_000)
            ->and(Ledger::balance($savings))->toBe(-2_500);
    });

    it('re-signs the amount when switching between expense and income', function (): void {
        $transaction = Ledger::expense($this->checking, 1_000, '2026-10-10', $this->groceries);

        $this->patchJson("/api/v1/transactions/{$transaction->id}", ['type' => 'income', 'category_id' => $this->salary->id])
            ->assertOk()
            ->assertJsonPath('data.type', 'income')
            ->assertJsonPath('data.signed_amount_cents', 1_000)
            ->assertJsonPath('data.amount_cents', 1_000);

        $this->patchJson("/api/v1/transactions/{$transaction->id}", ['type' => 'expense', 'category_id' => $this->groceries->id, 'amount_cents' => 700])
            ->assertOk()
            ->assertJsonPath('data.signed_amount_cents', -700);
    });

    it('requires a matching category when the type changes', function (): void {
        $transaction = Ledger::expense($this->checking, 1_000, '2026-10-10', $this->groceries);

        $this->patchJson("/api/v1/transactions/{$transaction->id}", ['type' => 'income'])
            ->assertUnprocessable()->assertJsonValidationErrors(['category_id']);

        $this->patchJson("/api/v1/transactions/{$transaction->id}", ['type' => 'income', 'category_id' => $this->groceries->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['category_id']);

        $this->patchJson("/api/v1/transactions/{$transaction->id}", ['type' => 'transfer'])
            ->assertUnprocessable()->assertJsonValidationErrors(['type']);
    });

    it('keeps an archived category that is already assigned but rejects switching to one', function (): void {
        $transaction = Ledger::expense($this->checking, 1_000, '2026-10-10', $this->groceries);
        $this->groceries->update(['archived_at' => now()]);
        $archived = Category::factory()->archived()->create();

        $this->patchJson("/api/v1/transactions/{$transaction->id}", ['amount_cents' => 1_500])->assertOk();
        $this->patchJson("/api/v1/transactions/{$transaction->id}", ['category_id' => $archived->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['category_id']);
    });

    it('rejects moving a movement to an archived account or before its opening date', function (): void {
        $archived = Account::factory()->openedOn(day('2026-01-01'))->archived()->create();
        $late = Account::factory()->openedOn(day('2026-10-12'))->create();
        $transaction = Ledger::expense($this->checking, 1_000, '2026-10-10', $this->groceries);

        $this->patchJson("/api/v1/transactions/{$transaction->id}", ['account_id' => $archived->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['account_id']);
        $this->patchJson("/api/v1/transactions/{$transaction->id}", ['account_id' => $late->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['date']);
        $this->patchJson("/api/v1/transactions/{$transaction->id}", ['date' => '2025-12-31'])
            ->assertUnprocessable()->assertJsonValidationErrors(['date']);
    });

    it('replaces the tag set only when tags are sent', function (): void {
        $transaction = Ledger::expense($this->checking, 1_000, '2026-10-10', $this->groceries);
        $transaction->tags()->attach(Tag::query()->create(['name' => 'casa']));

        $this->patchJson("/api/v1/transactions/{$transaction->id}", ['note' => 'x'])
            ->assertOk()->assertJsonPath('data.tags.0.name', 'casa');

        $this->patchJson("/api/v1/transactions/{$transaction->id}", ['tags' => ['Viaje', 'trabajo']])
            ->assertOk()->assertJsonPath('data.tags', [
                ['id' => Tag::query()->where('name', 'trabajo')->value('id'), 'name' => 'trabajo'],
                ['id' => Tag::query()->where('name', 'viaje')->value('id'), 'name' => 'viaje'],
            ]);

        $this->patchJson("/api/v1/transactions/{$transaction->id}", ['tags' => []])
            ->assertOk()->assertJsonPath('data.tags', []);
    });

    it('recomputes an adjustment delta excluding the adjustment itself', function (): void {
        $savings = Account::factory()->ofType(AccountType::SavingsInvestment)->openedOn(day('2026-01-01'), 1_000_000)->create();
        $adjustmentId = $this->postJson("/api/v1/accounts/{$savings->id}/adjustments", [
            'date' => '2026-10-01', 'target_balance_cents' => 1_200_000,
        ])->assertCreated()->json('data.id');
        Ledger::expense($savings, 50_000, '2026-10-05');

        $this->patchJson("/api/v1/transactions/{$adjustmentId}", ['target_balance_cents' => 900_000, 'note' => 'Revisado'])
            ->assertOk()
            ->assertJsonPath('data.type', 'adjustment')
            ->assertJsonPath('data.adjustment_target_cents', 900_000)
            ->assertJsonPath('data.signed_amount_cents', -100_000)
            ->assertJsonPath('data.amount_cents', 100_000)
            ->assertJsonPath('data.note', 'Revisado');

        expect(Ledger::balance($savings, day('2026-10-01')))->toBe(900_000);

        $this->patchJson("/api/v1/transactions/{$adjustmentId}", ['date' => '2026-10-06'])
            ->assertOk()
            ->assertJsonPath('data.date', '2026-10-06')
            ->assertJsonPath('data.signed_amount_cents', -50_000);

        expect(Ledger::balance($savings, day('2026-10-06')))->toBe(900_000);
    });

    it('rejects an adjustment edit whose delta becomes zero or whose date is invalid', function (): void {
        $savings = Account::factory()->ofType(AccountType::SavingsInvestment)->openedOn(day('2026-01-01'), 1_000_000)->create();
        $adjustmentId = $this->postJson("/api/v1/accounts/{$savings->id}/adjustments", [
            'date' => '2026-10-01', 'target_balance_cents' => 1_200_000,
        ])->json('data.id');

        $this->patchJson("/api/v1/transactions/{$adjustmentId}", ['target_balance_cents' => 1_000_000])
            ->assertUnprocessable()->assertJsonValidationErrors(['target_balance_cents']);
        $this->patchJson("/api/v1/transactions/{$adjustmentId}", ['date' => '2026-10-14'])
            ->assertUnprocessable()->assertJsonValidationErrors(['date']);
        $this->patchJson("/api/v1/transactions/{$adjustmentId}", ['date' => '2025-12-31'])
            ->assertUnprocessable()->assertJsonValidationErrors(['date']);
    });

    it('refuses to edit a transfer leg', function (): void {
        $savings = Account::factory()->openedOn(day('2026-01-01'))->create();
        $transfer = $this->postJson('/api/v1/transfers', [
            'from_account_id' => $this->checking->id, 'to_account_id' => $savings->id, 'amount_cents' => 10_000,
        ])->json('data');

        foreach ([$transfer['out_transaction_id'], $transfer['in_transaction_id']] as $legId) {
            $this->patchJson("/api/v1/transactions/{$legId}", ['amount_cents' => 5])
                ->assertConflict()
                ->assertExactJson(['message' => 'Este movimiento forma parte de una transferencia; modifícala desde la transferencia.', 'code' => 'transfer_leg_immutable']);
        }
    });
});

describe('DELETE and restore', function (): void {
    it('soft deletes a movement and restores it', function (): void {
        $transaction = Ledger::expense($this->checking, 1_000, '2026-10-10', $this->groceries);

        $this->deleteJson("/api/v1/transactions/{$transaction->id}")->assertNoContent();

        expect(Transaction::withTrashed()->findOrFail($transaction->id)->trashed())->toBeTrue()
            ->and(Ledger::balance($this->checking))->toBe(100_000);

        $this->postJson("/api/v1/transactions/{$transaction->id}/restore")
            ->assertOk()->assertJsonPath('data.id', $transaction->id);

        expect(Ledger::balance($this->checking))->toBe(99_000);
    });

    it('restores an adjustment', function (): void {
        $adjustmentId = $this->postJson("/api/v1/accounts/{$this->checking->id}/adjustments", [
            'date' => '2026-10-01', 'target_balance_cents' => 150_000,
        ])->json('data.id');

        $this->deleteJson("/api/v1/transactions/{$adjustmentId}")->assertNoContent();
        expect(Ledger::balance($this->checking))->toBe(100_000);

        $this->postJson("/api/v1/transactions/{$adjustmentId}/restore")->assertOk();
        expect(Ledger::balance($this->checking))->toBe(150_000);
    });

    it('restoring a live movement is a no-op', function (): void {
        $transaction = Ledger::expense($this->checking, 1_000, '2026-10-10', $this->groceries);

        $this->postJson("/api/v1/transactions/{$transaction->id}/restore")->assertOk();
        expect(Ledger::balance($this->checking))->toBe(99_000);
    });

    it('refuses to restore onto an archived account', function (): void {
        $transaction = Ledger::expense($this->checking, 1_000, '2026-10-10', $this->groceries);
        $this->deleteJson("/api/v1/transactions/{$transaction->id}")->assertNoContent();
        $this->postJson("/api/v1/accounts/{$this->checking->id}/archive")->assertOk();

        $this->postJson("/api/v1/transactions/{$transaction->id}/restore")
            ->assertUnprocessable()->assertJsonValidationErrors(['account_id']);
    });

    it('refuses to delete or restore a transfer leg', function (): void {
        $savings = Account::factory()->openedOn(day('2026-01-01'))->create();
        $transfer = $this->postJson('/api/v1/transfers', [
            'from_account_id' => $this->checking->id, 'to_account_id' => $savings->id, 'amount_cents' => 10_000,
        ])->json('data');

        $this->deleteJson("/api/v1/transactions/{$transfer['out_transaction_id']}")
            ->assertConflict()->assertJsonPath('code', 'transfer_leg_immutable');

        $this->deleteJson("/api/v1/transfers/{$transfer['id']}")->assertNoContent();

        $this->postJson("/api/v1/transactions/{$transfer['in_transaction_id']}/restore")
            ->assertConflict()->assertJsonPath('code', 'transfer_leg_immutable');
    });

    it('returns 404 when deleting a missing movement', function (): void {
        $this->deleteJson('/api/v1/transactions/999999')->assertNotFound();
        $this->postJson('/api/v1/transactions/999999/restore')->assertNotFound();
    });
});
