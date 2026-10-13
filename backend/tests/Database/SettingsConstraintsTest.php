<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Tests\Support\RawLedger;

it('ships the singleton settings row with defaults', function (): void {
    $settings = DB::table('settings')->sole();

    expect($settings->id)->toBe(1)
        ->and($settings->month_start_day)->toBe(1)
        ->and($settings->orphan_draft_ttl_days)->toBe(7)
        ->and($settings->default_account_id)->toBeNull()
        ->and($settings->last_used_account_id)->toBeNull();
});

it('rejects a second settings row', function (): void {
    RawLedger::expectRejected(
        fn () => DB::table('settings')->insert(['id' => 2]),
        'settings_singleton',
    );
});

it('rejects a month start day outside 1..28', function (int $day): void {
    RawLedger::expectRejected(
        fn () => DB::table('settings')->where('id', 1)->update(['month_start_day' => $day]),
        'settings_month_start_day_range',
    );
})->with([0, 29, 31]);

it('rejects an orphan draft ttl outside 1..90', function (int $days): void {
    RawLedger::expectRejected(
        fn () => DB::table('settings')->where('id', 1)->update(['orphan_draft_ttl_days' => $days]),
        'settings_orphan_draft_ttl_days_range',
    );
})->with([0, 91]);

it('rejects a default account that does not exist', function (): void {
    RawLedger::expectRejected(
        fn () => DB::table('settings')->where('id', 1)->update(['default_account_id' => 999_999]),
        'settings_default_account_fk',
    );
});

it('rejects a last used account that does not exist', function (): void {
    RawLedger::expectRejected(
        fn () => DB::table('settings')->where('id', 1)->update(['last_used_account_id' => 999_999]),
        'settings_last_used_account_fk',
    );
});

it('nulls the account pointers when the account row is hard deleted', function (): void {
    $accountId = RawLedger::account();
    DB::table('settings')->where('id', 1)->update(['default_account_id' => $accountId, 'last_used_account_id' => $accountId]);

    DB::table('accounts')->where('id', $accountId)->delete();

    $settings = DB::table('settings')->sole();
    expect($settings->default_account_id)->toBeNull()
        ->and($settings->last_used_account_id)->toBeNull();
});
