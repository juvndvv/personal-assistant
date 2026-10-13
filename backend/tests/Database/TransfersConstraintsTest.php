<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Tests\Support\RawLedger;

beforeEach(function (): void {
    $this->checking = RawLedger::account(['type' => 'checking']);
    $this->savings = RawLedger::account(['type' => 'savings_investment']);
    $this->card = RawLedger::account(['type' => 'credit_card']);
    $this->otherCard = RawLedger::account(['type' => 'credit_card']);
});

it('accepts a balanced transfer', function (): void {
    RawLedger::expectAccepted(fn () => RawLedger::balancedTransfer($this->checking, $this->savings));
});

it('rejects an unknown transfer kind', function (): void {
    RawLedger::expectRejected(
        fn () => RawLedger::transfer($this->checking, $this->savings, ['kind' => 'refund']),
        'transfers_kind_check',
    );
});

it('rejects a non-positive transfer amount', function (int $amount): void {
    RawLedger::expectRejected(
        fn () => RawLedger::transfer($this->checking, $this->savings, ['amount_cents' => $amount]),
        'transfers_amount_positive',
    );
})->with([0, -100]);

it('rejects a transfer to the same account', function (): void {
    RawLedger::expectRejected(
        fn () => RawLedger::transfer($this->checking, $this->checking),
        'transfers_distinct_accounts',
    );
});

it('rejects a transfer from an unknown account', function (): void {
    RawLedger::expectRejected(
        fn () => RawLedger::transfer(999_999, $this->checking),
        'transfers_from_account_fk',
    );
});

it('rejects a card settlement into a non-card account', function (): void {
    RawLedger::expectRejected(
        fn () => RawLedger::transfer($this->checking, $this->savings, ['kind' => 'card_settlement']),
        'must go to a credit card account',
    );
});

it('rejects a card settlement paid from a card', function (): void {
    RawLedger::expectRejected(
        fn () => RawLedger::transfer($this->otherCard, $this->card, ['kind' => 'card_settlement']),
        'cannot be paid from a credit card account',
    );
});

it('accepts a balanced card settlement', function (): void {
    RawLedger::expectAccepted(
        fn () => RawLedger::balancedTransfer($this->checking, $this->card, 4500, '2026-03-05', 'card_settlement'),
    );
});

it('rejects turning a plain transfer into a settlement to a non-card account', function (): void {
    $ids = RawLedger::balancedTransfer($this->checking, $this->savings);

    RawLedger::expectRejected(
        fn () => DB::table('transfers')->where('id', $ids['transfer'])->update(['kind' => 'card_settlement']),
        'must go to a credit card account',
    );
});

it('rejects a transfer without legs at commit', function (): void {
    RawLedger::expectRejected(
        fn () => RawLedger::transfer($this->checking, $this->savings),
        'does not have two balanced legs',
    );
});

it('rejects unbalanced transfer legs', function (): void {
    RawLedger::expectRejected(function (): void {
        $transferId = RawLedger::transfer($this->checking, $this->savings, ['amount_cents' => 5000]);
        RawLedger::leg($transferId, 'out', $this->checking, -5000);
        RawLedger::leg($transferId, 'in', $this->savings, 4000);
    }, 'does not have two balanced legs');
});

it('rejects legs on the wrong accounts', function (): void {
    RawLedger::expectRejected(function (): void {
        $transferId = RawLedger::transfer($this->checking, $this->savings);
        RawLedger::leg($transferId, 'out', $this->savings, -5000);
        RawLedger::leg($transferId, 'in', $this->checking, 5000);
    }, 'does not have two balanced legs');
});

it('rejects legs dated differently from the transfer', function (): void {
    RawLedger::expectRejected(function (): void {
        $transferId = RawLedger::transfer($this->checking, $this->savings, ['date' => '2026-03-01']);
        RawLedger::leg($transferId, 'out', $this->checking, -5000, '2026-03-01');
        RawLedger::leg($transferId, 'in', $this->savings, 5000, '2026-03-02');
    }, 'does not have two balanced legs');
});

it('rejects a third leg', function (): void {
    $ids = RawLedger::balancedTransfer($this->checking, $this->savings);

    RawLedger::expectRejected(
        fn () => RawLedger::leg($ids['transfer'], 'out', $this->checking, -5000),
        'transactions_transfer_leg_unique',
    );
});

it('rejects changing the transfer amount without its legs', function (): void {
    $ids = RawLedger::balancedTransfer($this->checking, $this->savings);

    RawLedger::expectRejected(
        fn () => DB::table('transfers')->where('id', $ids['transfer'])->update(['amount_cents' => 7000]),
        'does not have two balanced legs',
    );
});

it('accepts changing the transfer amount together with its legs', function (): void {
    $ids = RawLedger::balancedTransfer($this->checking, $this->savings);

    RawLedger::expectAccepted(function () use ($ids): void {
        DB::table('transfers')->where('id', $ids['transfer'])->update(['amount_cents' => 7000]);
        DB::table('transactions')->where('id', $ids['out'])->update(['amount_cents' => -7000]);
        DB::table('transactions')->where('id', $ids['in'])->update(['amount_cents' => 7000]);
    });
});

it('rejects soft-deleting one leg of a live transfer', function (): void {
    $ids = RawLedger::balancedTransfer($this->checking, $this->savings);

    RawLedger::expectRejected(
        fn () => DB::table('transactions')->where('id', $ids['in'])->update(['deleted_at' => now()]),
        'does not have two balanced legs',
    );
});

it('rejects soft-deleting a transfer while its legs stay live', function (): void {
    $ids = RawLedger::balancedTransfer($this->checking, $this->savings);

    RawLedger::expectRejected(
        fn () => DB::table('transfers')->where('id', $ids['transfer'])->update(['deleted_at' => now()]),
        'still has 2 live legs',
    );
});

it('accepts soft-deleting a transfer together with its legs', function (): void {
    $ids = RawLedger::balancedTransfer($this->checking, $this->savings);

    RawLedger::expectAccepted(function () use ($ids): void {
        DB::table('transfers')->where('id', $ids['transfer'])->update(['deleted_at' => now()]);
        DB::table('transactions')->whereIn('id', [$ids['out'], $ids['in']])->update(['deleted_at' => now()]);
    });
});

it('rejects hard-deleting a single leg', function (): void {
    $ids = RawLedger::balancedTransfer($this->checking, $this->savings);

    RawLedger::expectRejected(
        fn () => DB::table('transactions')->where('id', $ids['out'])->delete(),
        'does not have two balanced legs',
    );
});

it('cascades a hard-deleted transfer to its legs', function (): void {
    $ids = RawLedger::balancedTransfer($this->checking, $this->savings);

    RawLedger::expectAccepted(fn () => DB::table('transfers')->where('id', $ids['transfer'])->delete());

    expect(DB::table('transactions')->whereIn('id', [$ids['out'], $ids['in']])->count())->toBe(0);
});
