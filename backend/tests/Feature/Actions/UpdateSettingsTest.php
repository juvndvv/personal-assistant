<?php

declare(strict_types=1);

use App\Actions\Settings\UpdateSettings;
use App\Models\Account;
use App\Models\Setting;
use Illuminate\Validation\ValidationException;

it('updates the month start day, default account and draft ttl', function (): void {
    $account = Account::factory()->create();

    $settings = app(UpdateSettings::class)->handle([
        'month_start_day' => 25,
        'default_account_id' => $account->id,
        'orphan_draft_ttl_days' => 14,
    ]);

    expect($settings->month_start_day)->toBe(25)
        ->and($settings->default_account_id)->toBe($account->id)
        ->and($settings->orphan_draft_ttl_days)->toBe(14)
        ->and(Setting::current()->month_start_day)->toBe(25);
});

it('clears the default account', function (): void {
    Setting::current()->update(['default_account_id' => Account::factory()->create()->id]);

    expect(app(UpdateSettings::class)->handle(['default_account_id' => null])->default_account_id)->toBeNull();
});

it('rejects an archived or missing default account', function (?int $accountId): void {
    $archived = Account::factory()->archived()->create();

    app(UpdateSettings::class)->handle(['default_account_id' => $accountId ?? $archived->id]);
})->with([null, 999_999])->throws(ValidationException::class);

it('never writes the last used account', function (): void {
    $account = Account::factory()->create();

    app(UpdateSettings::class)->handle(['last_used_account_id' => $account->id]);

    expect(Setting::current()->last_used_account_id)->toBeNull();
});
