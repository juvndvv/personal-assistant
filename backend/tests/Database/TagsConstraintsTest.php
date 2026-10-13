<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Tests\Support\RawLedger;

function tag(string $name): int
{
    return (int) DB::table('tags')->insertGetId(['name' => $name, 'created_at' => now(), 'updated_at' => now()]);
}

it('rejects a blank tag name', function (string $name): void {
    RawLedger::expectRejected(fn () => tag($name), 'tags_name_not_blank');
})->with(['', '   ']);

it('rejects duplicate tag names case-insensitively', function (): void {
    tag('Viaje Roma');

    RawLedger::expectRejected(fn () => tag('viaje roma'), 'tags_name_unique');
});

it('links tags to movements once and cascades deletes', function (): void {
    $accountId = RawLedger::account();
    $categoryId = RawLedger::category();
    $transactionId = RawLedger::transaction(['account_id' => $accountId, 'category_id' => $categoryId]);
    $tagId = tag('casa');

    DB::table('tag_transaction')->insert(['transaction_id' => $transactionId, 'tag_id' => $tagId]);

    RawLedger::expectRejected(
        fn () => DB::table('tag_transaction')->insert(['transaction_id' => $transactionId, 'tag_id' => $tagId]),
        'tag_transaction_pkey',
    );

    DB::table('tags')->where('id', $tagId)->delete();

    expect(DB::table('tag_transaction')->count())->toBe(0);
});

it('rejects a link to an unknown tag', function (): void {
    $transactionId = RawLedger::transaction(['account_id' => RawLedger::account(), 'category_id' => RawLedger::category()]);

    RawLedger::expectRejected(
        fn () => DB::table('tag_transaction')->insert(['transaction_id' => $transactionId, 'tag_id' => 999_999]),
        'tag_transaction_tag_fk',
    );
});
