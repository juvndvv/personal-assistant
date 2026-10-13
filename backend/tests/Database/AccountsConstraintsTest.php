<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Tests\Support\RawLedger;

it('accepts every account type', function (string $type): void {
    RawLedger::expectAccepted(fn () => RawLedger::account(['type' => $type]));
})->with(['checking', 'cash', 'credit_card', 'savings_investment']);

it('rejects an unknown account type', function (): void {
    RawLedger::expectRejected(fn () => RawLedger::account(['type' => 'wallet']), 'accounts_type_check');
});

it('rejects a statement day outside 1..28', function (): void {
    RawLedger::expectRejected(
        fn () => RawLedger::account(['type' => 'credit_card', 'statement_day' => 29]),
        'accounts_statement_day_range',
    );
});

it('rejects card fields on a non-card account', function (array $fields): void {
    $settlementId = RawLedger::account();

    RawLedger::expectRejected(
        fn () => RawLedger::account(['type' => 'checking', ...array_map(fn ($value) => $value === 'settlement' ? $settlementId : $value, $fields)]),
        'accounts_card_fields_only_on_cards',
    );
})->with([
    'statement day' => [['statement_day' => 5]],
    'settlement account' => [['settlement_account_id' => 'settlement']],
]);

it('rejects a card that settles into itself', function (): void {
    $cardId = RawLedger::account(['type' => 'credit_card']);

    RawLedger::expectRejected(
        fn () => DB::table('accounts')->where('id', $cardId)->update(['settlement_account_id' => $cardId]),
        'accounts_settlement_not_self',
    );
});

it('rejects a settlement account that does not exist', function (): void {
    RawLedger::expectRejected(
        fn () => RawLedger::account(['type' => 'credit_card', 'settlement_account_id' => 999_999]),
        'accounts_settlement_account_fk',
    );
});

it('rejects a duplicate name case-insensitively among live accounts', function (): void {
    RawLedger::account(['name' => 'BBVA']);

    RawLedger::expectRejected(fn () => RawLedger::account(['name' => 'bbva']), 'accounts_name_unique');
});

it('allows reusing the name of a soft-deleted account', function (): void {
    RawLedger::account(['name' => 'BBVA', 'deleted_at' => now()]);

    RawLedger::expectAccepted(fn () => RawLedger::account(['name' => 'BBVA']));
});

it('stores negative opening balances', function (): void {
    $id = RawLedger::account(['type' => 'credit_card', 'opening_balance_cents' => -12_000]);

    expect(DB::table('accounts')->where('id', $id)->value('opening_balance_cents'))->toBe(-12_000);
});
