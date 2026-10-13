<?php

declare(strict_types=1);

use App\Models\Account;
use App\Models\Setting;
use App\Models\User;
use Carbon\CarbonImmutable;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());
});

it('shows the settings with the current period', function (): void {
    $this->getJson('/api/v1/settings')
        ->assertOk()
        ->assertExactJson(['data' => [
            'month_start_day' => 1,
            'default_account_id' => null,
            'last_used_account_id' => null,
            'orphan_draft_ttl_days' => 7,
            'current_period' => ['label' => '2026-10', 'start' => '2026-10-01', 'end' => '2026-10-31', 'month_start_day' => 1],
        ]]);
});

it('updates the settings and re-buckets the current period', function (): void {
    $account = Account::factory()->create();

    $this->patchJson('/api/v1/settings', ['month_start_day' => 25, 'default_account_id' => $account->id, 'orphan_draft_ttl_days' => 30])
        ->assertOk()
        ->assertJsonPath('data.month_start_day', 25)
        ->assertJsonPath('data.default_account_id', $account->id)
        ->assertJsonPath('data.orphan_draft_ttl_days', 30)
        ->assertJsonPath('data.current_period', ['label' => '2026-10', 'start' => '2026-09-25', 'end' => '2026-10-24', 'month_start_day' => 25]);

    expect(Setting::current()->month_start_day)->toBe(25);
});

it('validates the settings payload', function (array $payload, string $field): void {
    $this->patchJson('/api/v1/settings', $payload)->assertUnprocessable()->assertJsonValidationErrors([$field]);
})->with([
    'start day 0' => [['month_start_day' => 0], 'month_start_day'],
    'start day 29' => [['month_start_day' => 29], 'month_start_day'],
    'ttl 0' => [['orphan_draft_ttl_days' => 0], 'orphan_draft_ttl_days'],
    'ttl 91' => [['orphan_draft_ttl_days' => 91], 'orphan_draft_ttl_days'],
    'unknown account' => [['default_account_id' => 999_999], 'default_account_id'],
]);

it('rejects an archived default account', function (): void {
    $archived = Account::factory()->archived()->create();

    $this->patchJson('/api/v1/settings', ['default_account_id' => $archived->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['default_account_id']);
});

it('returns the payday period on 2026-10-13 with start day 25', function (): void {
    Setting::current()->update(['month_start_day' => 25]);

    $this->getJson('/api/v1/periods/current')
        ->assertOk()
        ->assertExactJson(['data' => ['label' => '2026-10', 'start' => '2026-09-25', 'end' => '2026-10-24', 'month_start_day' => 25]]);
});

it('returns the calendar month with start day 1', function (): void {
    $this->getJson('/api/v1/periods/current')
        ->assertOk()
        ->assertExactJson(['data' => ['label' => '2026-10', 'start' => '2026-10-01', 'end' => '2026-10-31', 'month_start_day' => 1]]);
});

it('previews another start day without persisting it', function (): void {
    $this->getJson('/api/v1/periods/current?month_start_day=25')
        ->assertOk()
        ->assertJsonPath('data.start', '2026-09-25');

    expect(Setting::current()->month_start_day)->toBe(1);
});

it('rejects an invalid preview start day', function (): void {
    $this->getJson('/api/v1/periods/current?month_start_day=29')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['month_start_day']);
});

it('lists periods oldest first ending at the requested label', function (): void {
    Setting::current()->update(['month_start_day' => 25]);

    $this->getJson('/api/v1/periods?count=3&until=2027-01')
        ->assertOk()
        ->assertExactJson(['data' => [
            ['label' => '2026-11', 'start' => '2026-10-25', 'end' => '2026-11-24', 'month_start_day' => 25],
            ['label' => '2026-12', 'start' => '2026-11-25', 'end' => '2026-12-24', 'month_start_day' => 25],
            ['label' => '2027-01', 'start' => '2026-12-25', 'end' => '2027-01-24', 'month_start_day' => 25],
        ]]);
});

it('lists twelve periods up to the current one by default', function (): void {
    $response = $this->getJson('/api/v1/periods')->assertOk()->assertJsonCount(12, 'data');

    expect($response->json('data.0.label'))->toBe('2025-11')
        ->and($response->json('data.11.label'))->toBe('2026-10');
});

it('validates the period list query', function (string $query, string $field): void {
    $this->getJson("/api/v1/periods?{$query}")->assertUnprocessable()->assertJsonValidationErrors([$field]);
})->with([
    ['count=0', 'count'],
    ['count=37', 'count'],
    ['until=2026-13', 'until'],
    ['until=october', 'until'],
]);

it('resolves the period of a date', function (): void {
    Setting::current()->update(['month_start_day' => 25]);

    $this->getJson('/api/v1/periods/resolve?date=2026-10-25')
        ->assertOk()
        ->assertExactJson(['data' => ['label' => '2026-11', 'start' => '2026-10-25', 'end' => '2026-11-24', 'month_start_day' => 25]]);
});

it('requires a valid date to resolve a period', function (string $query): void {
    $this->getJson("/api/v1/periods/resolve{$query}")->assertUnprocessable()->assertJsonValidationErrors(['date']);
})->with(['', '?date=2026-02-30', '?date=13/10/2026']);

it('returns Spanish validation messages with Spanish field names', function (): void {
    $this->patchJson('/api/v1/settings', ['month_start_day' => 29])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['month_start_day' => 'El campo día de inicio del mes debe estar entre 1 y 28.']);

    $this->postJson('/api/v1/categories', ['name' => 'Ocio'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['kind' => 'El campo tipo es obligatorio.']);

    $this->postJson('/api/v1/accounts', ['type' => 'checking', 'name' => 'Banco', 'opening_balance_cents' => 0, 'opening_date' => '2026-10-14'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['opening_date' => 'El campo fecha de apertura debe ser una fecha anterior o igual a hoy.']);
});
