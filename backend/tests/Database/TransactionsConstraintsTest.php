<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Tests\Support\RawLedger;

beforeEach(function (): void {
    $this->account = RawLedger::account(['opening_date' => '2026-01-01']);
    $this->otherAccount = RawLedger::account(['opening_date' => '2026-01-01']);
    $this->expenseCategory = RawLedger::category(['kind' => 'expense']);
    $this->incomeCategory = RawLedger::category(['kind' => 'income']);
});

function expense(array $overrides = []): int
{
    return RawLedger::transaction([
        'type' => 'expense',
        'account_id' => test()->account,
        'category_id' => test()->expenseCategory,
        'amount_cents' => -1000,
        ...$overrides,
    ]);
}

function adjustment(array $overrides = []): int
{
    return RawLedger::transaction([
        'type' => 'adjustment',
        'account_id' => test()->account,
        'amount_cents' => 500,
        'adjustment_target_cents' => 10_000,
        ...$overrides,
    ]);
}

it('accepts a valid expense, income and adjustment', function (): void {
    RawLedger::expectAccepted(function (): void {
        expense();
        RawLedger::transaction(['type' => 'income', 'account_id' => $this->account, 'category_id' => $this->incomeCategory, 'amount_cents' => 2000]);
        adjustment(['amount_cents' => -300]);
    });
});

it('derives the category kind from the type', function (): void {
    $expenseId = expense();
    $adjustmentId = adjustment();

    expect(DB::table('transactions')->where('id', $expenseId)->value('category_kind'))->toBe('expense')
        ->and(DB::table('transactions')->where('id', $adjustmentId)->value('category_kind'))->toBeNull();
});

it('rejects an unknown type', function (): void {
    RawLedger::expectRejected(fn () => expense(['type' => 'refund']), 'violates check constraint');
});

it('rejects an unknown origin', function (): void {
    RawLedger::expectRejected(fn () => expense(['origin' => 'email']), 'transactions_origin_check');
});

it('rejects an expense with a positive amount', function (): void {
    RawLedger::expectRejected(fn () => expense(['amount_cents' => 1000]), 'transactions_amount_sign');
});

it('rejects an income with a negative amount', function (): void {
    RawLedger::expectRejected(
        fn () => RawLedger::transaction(['type' => 'income', 'account_id' => $this->account, 'category_id' => $this->incomeCategory, 'amount_cents' => -1000]),
        'transactions_amount_sign',
    );
});

it('rejects a zero amount on every type', function (string $type): void {
    RawLedger::expectRejected(
        fn () => RawLedger::transaction([
            'type' => $type,
            'account_id' => $this->account,
            'amount_cents' => 0,
            'category_id' => match ($type) {
                'expense' => $this->expenseCategory,
                'income' => $this->incomeCategory,
                default => null,
            },
            'adjustment_target_cents' => $type === 'adjustment' ? 0 : null,
        ]),
        'transactions_amount_sign',
    );
})->with(['expense', 'income', 'adjustment']);

it('rejects an income category on an expense', function (): void {
    RawLedger::expectRejected(
        fn () => expense(['category_id' => $this->incomeCategory]),
        'transactions_category_kind_fk',
    );
});

it('rejects an expense category on an income', function (): void {
    RawLedger::expectRejected(
        fn () => RawLedger::transaction(['type' => 'income', 'account_id' => $this->account, 'category_id' => $this->expenseCategory, 'amount_cents' => 1000]),
        'transactions_category_kind_fk',
    );
});

it('rejects an expense without category', function (): void {
    RawLedger::expectRejected(fn () => expense(['category_id' => null]), 'transactions_category_presence');
});

it('rejects an adjustment with a category', function (): void {
    RawLedger::expectRejected(
        fn () => adjustment(['category_id' => $this->expenseCategory]),
        'transactions_category_presence',
    );
});

it('rejects an unknown category', function (): void {
    RawLedger::expectRejected(fn () => expense(['category_id' => 999_999]), 'transactions_category_kind_fk');
});

it('rejects a transfer row without a transfer link', function (): void {
    RawLedger::expectRejected(
        fn () => RawLedger::transaction(['type' => 'transfer', 'account_id' => $this->account, 'amount_cents' => -500]),
        'transactions_transfer_link',
    );
});

it('rejects a transfer link on an expense', function (): void {
    $ids = RawLedger::balancedTransfer($this->account, $this->otherAccount);

    RawLedger::expectRejected(
        fn () => expense(['transfer_id' => $ids['transfer'], 'transfer_leg' => 'out']),
        'transactions_transfer_link',
    );
});

it('rejects a transfer leg on an expense even without transfer id', function (): void {
    RawLedger::expectRejected(fn () => expense(['transfer_leg' => 'out']), 'transactions_transfer_link_only_on_transfers');
});

it('rejects an unknown transfer leg', function (): void {
    RawLedger::expectRejected(function (): void {
        $transferId = RawLedger::transfer($this->account, $this->otherAccount);
        RawLedger::leg($transferId, 'up', $this->account, -5000);
    }, 'transactions_transfer_leg_check');
});

it('rejects an adjustment without target', function (): void {
    RawLedger::expectRejected(fn () => adjustment(['adjustment_target_cents' => null]), 'transactions_adjustment_target');
});

it('rejects an adjustment target on an expense', function (): void {
    RawLedger::expectRejected(fn () => expense(['adjustment_target_cents' => 100]), 'transactions_adjustment_target');
});

it('rejects an adjustment with a non-manual origin', function (): void {
    RawLedger::expectRejected(fn () => adjustment(['origin' => 'voice']), 'transactions_adjustment_manual_origin');
});

it('rejects a recurring origin on a transfer leg', function (): void {
    RawLedger::expectRejected(function (): void {
        $transferId = RawLedger::transfer($this->account, $this->otherAccount);
        RawLedger::transaction([
            'type' => 'transfer', 'account_id' => $this->account, 'amount_cents' => -5000,
            'transfer_id' => $transferId, 'transfer_leg' => 'out', 'origin' => 'recurring',
        ]);
    }, 'transactions_recurring_origin_types');
});

it('accepts a recurring expense', function (): void {
    RawLedger::expectAccepted(fn () => expense(['origin' => 'recurring']));
});

it('rejects a movement dated before the account opening date', function (): void {
    RawLedger::expectRejected(fn () => expense(['date' => '2025-12-31']), 'precedes the opening date');
});

it('accepts a movement dated on the opening date', function (): void {
    RawLedger::expectAccepted(fn () => expense(['date' => '2026-01-01']));
});

it('rejects moving a movement before the opening date', function (): void {
    $id = expense();

    RawLedger::expectRejected(
        fn () => DB::table('transactions')->where('id', $id)->update(['date' => '2025-06-01']),
        'precedes the opening date',
    );
});

it('rejects moving a movement to an account opened later', function (): void {
    $lateAccount = RawLedger::account(['opening_date' => '2026-06-01']);
    $id = expense(['date' => '2026-03-01']);

    RawLedger::expectRejected(
        fn () => DB::table('transactions')->where('id', $id)->update(['account_id' => $lateAccount]),
        'precedes the opening date',
    );
});

it('rejects a movement on an archived account', function (): void {
    $archived = RawLedger::account(['archived_at' => now()]);

    RawLedger::expectRejected(fn () => expense(['account_id' => $archived]), 'is archived or deleted');
});

it('rejects a movement on a soft-deleted account', function (): void {
    $deleted = RawLedger::account(['deleted_at' => now()]);

    RawLedger::expectRejected(fn () => expense(['account_id' => $deleted]), 'is archived or deleted');
});

it('rejects moving a movement onto an archived account', function (): void {
    $archived = RawLedger::account(['archived_at' => now()]);
    $id = expense();

    RawLedger::expectRejected(
        fn () => DB::table('transactions')->where('id', $id)->update(['account_id' => $archived]),
        'is archived or deleted',
    );
});

it('still allows soft-deleting a movement of an archived account', function (): void {
    $id = expense();
    DB::table('accounts')->where('id', $this->account)->update(['archived_at' => now()]);

    RawLedger::expectAccepted(fn () => DB::table('transactions')->where('id', $id)->update(['deleted_at' => now()]));
});

it('rejects deleting a category that movements reference', function (): void {
    expense();

    RawLedger::expectRejected(
        fn () => DB::table('categories')->where('id', $this->expenseCategory)->delete(),
        'transactions_category_kind_fk',
    );
});

it('rejects hard-deleting an account that movements reference', function (): void {
    expense();

    RawLedger::expectRejected(
        fn () => DB::table('accounts')->where('id', $this->account)->delete(),
        'transactions_account_fk',
    );
});

it('creates every index of the data model', function (): void {
    $indexes = DB::table('pg_indexes')->where('tablename', 'transactions')->pluck('indexname')->all();

    expect($indexes)->toContain(
        'transactions_account_date_index',
        'transactions_reportable_date_index',
        'transactions_category_date_index',
        'transactions_transfer_id_index',
        'transactions_origin_created_at_index',
        'transactions_search_trgm_index',
    );
});

it('uses the trigram index for accent-insensitive search', function (): void {
    $definition = DB::table('pg_indexes')->where('indexname', 'transactions_search_trgm_index')->value('indexdef');

    expect($definition)->toContain('gin')->toContain('f_unaccent')->toContain('gin_trgm_ops');
});
