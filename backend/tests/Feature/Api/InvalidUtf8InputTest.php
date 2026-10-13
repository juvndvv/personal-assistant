<?php

declare(strict_types=1);

use App\Models\Account;
use App\Models\Category;
use App\Models\Tag;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Testing\TestResponse;

const INVALID_UTF8 = "\xC3\x28";

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());
    $this->checking = Account::factory()->openedOn(day('2026-01-01'), 500_000)->create();
    $this->savings = Account::factory()->openedOn(day('2026-01-01'))->create();
    $this->category = Category::factory()->create();
});

function postForm(string $method, string $uri, array $data): TestResponse
{
    return test()->call($method, $uri, $data, [], [], ['HTTP_ACCEPT' => 'application/json']);
}

function transactionForm(array $overrides = []): array
{
    return [
        'type' => 'expense',
        'amount_cents' => 1_000,
        'account_id' => test()->checking->id,
        'category_id' => test()->category->id,
        ...$overrides,
    ];
}

it('rejects invalid UTF-8 in transaction text fields with a 422', function (string $field, mixed $value, string $errorKey): void {
    postForm('POST', '/api/v1/transactions', transactionForm([$field => $value]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors([$errorKey]);

    $transaction = $this->postJson('/api/v1/transactions', transactionForm())->assertCreated()->json('data');

    postForm('PATCH', "/api/v1/transactions/{$transaction['id']}", [$field => $value])
        ->assertUnprocessable()
        ->assertJsonValidationErrors([$errorKey]);
})->with([
    'description' => ['description', INVALID_UTF8, 'description'],
    'merchant' => ['merchant', INVALID_UTF8, 'merchant'],
    'note' => ['note', INVALID_UTF8, 'note'],
    'tag' => ['tags', [INVALID_UTF8], 'tags.0'],
]);

it('rejects invalid UTF-8 in transfer notes with a 422', function (): void {
    $payload = [
        'from_account_id' => $this->checking->id,
        'to_account_id' => $this->savings->id,
        'amount_cents' => 10_000,
    ];

    postForm('POST', '/api/v1/transfers', [...$payload, 'note' => INVALID_UTF8])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['note']);

    $transfer = $this->postJson('/api/v1/transfers', $payload)->assertCreated()->json('data');

    postForm('PATCH', "/api/v1/transfers/{$transfer['id']}", ['note' => INVALID_UTF8])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['note']);
});

it('rejects invalid UTF-8 in tag names with a 422', function (): void {
    postForm('POST', '/api/v1/tags', ['name' => INVALID_UTF8])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['name']);

    $tag = Tag::query()->create(['name' => 'casa']);

    postForm('PATCH', "/api/v1/tags/{$tag->id}", ['name' => INVALID_UTF8])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['name']);

    expect(Tag::query()->pluck('name')->all())->toBe(['casa']);
});
