<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Tests\Support\RawLedger;

function insertHint(array $overrides = []): int
{
    $id = DB::table('categorization_hints')->insertGetId([
        'kind' => 'expense',
        'key' => 'mercadona',
        'category_id' => $overrides['category_id'] ?? RawLedger::category(),
        'account_id' => null,
        'last_used_at' => now(),
        'created_at' => now(),
        'updated_at' => now(),
        ...$overrides,
    ]);

    return is_numeric($id) ? (int) $id : 0;
}

it('accepts a hint and defaults hits to one', function (): void {
    $account = RawLedger::account();

    RawLedger::expectAccepted(fn () => insertHint(['account_id' => $account]));

    expect(DB::table('categorization_hints')->value('hits'))->toBe(1);
});

it('rejects a hint whose category kind does not match', function (): void {
    $income = RawLedger::category(['kind' => 'income']);

    RawLedger::expectRejected(fn () => insertHint(['category_id' => $income]), 'categorization_hints_category_kind_fk');
});

it('rejects an unknown kind, a blank key and non-positive hits', function (array $overrides, string $constraint): void {
    RawLedger::expectRejected(fn () => insertHint($overrides), $constraint);
})->with([
    'kind' => [['kind' => 'transfer'], 'categorization_hints_kind_check'],
    'blank key' => [['key' => '  '], 'categorization_hints_key_not_blank'],
    'zero hits' => [['hits' => 0], 'categorization_hints_hits_positive'],
]);

it('keeps one hint per kind and key', function (): void {
    $category = RawLedger::category();
    insertHint(['category_id' => $category]);

    RawLedger::expectRejected(fn () => insertHint(['category_id' => $category]), 'categorization_hints_kind_key_unique');
});

it('deletes hints with their category and forgets a deleted account', function (): void {
    $category = RawLedger::category();
    $account = RawLedger::account();
    insertHint(['category_id' => $category, 'account_id' => $account]);

    DB::table('accounts')->where('id', $account)->delete();
    expect(DB::table('categorization_hints')->value('account_id'))->toBeNull();

    DB::table('categories')->where('id', $category)->delete();
    expect(DB::table('categorization_hints')->count())->toBe(0);
});

it('indexes keys for trigram lookups', function (): void {
    $definition = DB::table('pg_indexes')
        ->where('tablename', 'categorization_hints')
        ->where('indexname', 'categorization_hints_key_trgm')
        ->value('indexdef');

    expect($definition)->toContain('gin')->toContain('gin_trgm_ops');
});
