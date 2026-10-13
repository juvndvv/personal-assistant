<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Tests\Support\RawLedger;

it('rejects an unknown category kind', function (): void {
    RawLedger::expectRejected(fn () => RawLedger::category(['kind' => 'transfer']), 'categories_kind_check');
});

it('rejects a child whose kind differs from its parent', function (): void {
    $parentId = RawLedger::category(['kind' => 'expense']);

    RawLedger::expectRejected(
        fn () => RawLedger::category(['kind' => 'income', 'parent_id' => $parentId]),
        'categories_parent_same_kind_fk',
    );
});

it('rejects changing the kind of a parent that has children', function (): void {
    $parentId = RawLedger::category(['kind' => 'expense']);
    RawLedger::category(['kind' => 'expense', 'parent_id' => $parentId]);

    RawLedger::expectRejected(
        fn () => DB::table('categories')->where('id', $parentId)->update(['kind' => 'income']),
        'categories_parent_same_kind_fk',
    );
});

it('rejects changing the kind of a child away from its parent', function (): void {
    $parentId = RawLedger::category(['kind' => 'expense']);
    $childId = RawLedger::category(['kind' => 'expense', 'parent_id' => $parentId]);

    RawLedger::expectRejected(
        fn () => DB::table('categories')->where('id', $childId)->update(['kind' => 'income']),
        'categories_parent_same_kind_fk',
    );
});

it('rejects a category that is its own parent', function (): void {
    $id = RawLedger::category();

    RawLedger::expectRejected(
        fn () => DB::table('categories')->where('id', $id)->update(['parent_id' => $id]),
        'categories_not_own_parent',
    );
});

it('rejects a third category level', function (): void {
    $topId = RawLedger::category();
    $childId = RawLedger::category(['parent_id' => $topId]);

    RawLedger::expectRejected(
        fn () => RawLedger::category(['parent_id' => $childId]),
        'cannot be nested under subcategory',
    );
});

it('rejects moving a category with children under another category', function (): void {
    $topId = RawLedger::category();
    RawLedger::category(['parent_id' => $topId]);
    $otherTopId = RawLedger::category();

    RawLedger::expectRejected(
        fn () => DB::table('categories')->where('id', $topId)->update(['parent_id' => $otherTopId]),
        'has subcategories and cannot become a subcategory',
    );
});

it('rejects a malformed color', function (string $color): void {
    RawLedger::expectRejected(fn () => RawLedger::category(['color' => $color]), 'categories_color_format');
})->with(['red', '#12345', '#GGGGGG', '123456A']);

it('accepts a well formed color', function (): void {
    RawLedger::expectAccepted(fn () => RawLedger::category(['color' => '#2e7D32']));
});

it('rejects duplicate top-level names per kind case-insensitively', function (): void {
    RawLedger::category(['name' => 'Ocio']);

    RawLedger::expectRejected(fn () => RawLedger::category(['name' => 'OCIO']), 'categories_name_unique');
});

it('allows the same name in the other kind', function (): void {
    RawLedger::category(['name' => 'Otros', 'kind' => 'expense']);

    RawLedger::expectAccepted(fn () => RawLedger::category(['name' => 'Otros', 'kind' => 'income']));
});

it('rejects duplicate sibling names but allows them under different parents', function (): void {
    $firstParent = RawLedger::category();
    $secondParent = RawLedger::category();
    RawLedger::category(['name' => 'Varios', 'parent_id' => $firstParent]);

    RawLedger::expectAccepted(fn () => RawLedger::category(['name' => 'Varios', 'parent_id' => $secondParent]));
    RawLedger::expectRejected(fn () => RawLedger::category(['name' => 'varios', 'parent_id' => $firstParent]), 'categories_name_unique');
});

it('restricts deleting a parent that has children', function (): void {
    $parentId = RawLedger::category();
    RawLedger::category(['parent_id' => $parentId]);

    RawLedger::expectRejected(
        fn () => DB::table('categories')->where('id', $parentId)->delete(),
        'categories_parent_same_kind_fk',
    );
});
