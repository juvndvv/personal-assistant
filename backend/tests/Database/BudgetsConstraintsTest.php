<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Tests\Support\RawLedger;

it('accepts a budget on a top-level expense category', function (): void {
    $category = RawLedger::category();

    RawLedger::expectAccepted(function () use ($category): void {
        RawLedger::budget($category, '2026-07');
        RawLedger::budget($category, '2026-11', ['amount_cents' => 0]);
    });

    expect(DB::table('budgets')->where('category_id', $category)->pluck('category_kind')->all())->toBe(['expense', 'expense']);
});

it('rejects a budget on an income category', function (): void {
    $income = RawLedger::category(['kind' => 'income']);

    RawLedger::expectRejected(fn () => RawLedger::budget($income), 'budgets_category_kind_fk');
});

it('rejects a budget on a subcategory', function (): void {
    $parent = RawLedger::category();
    $child = RawLedger::category(['parent_id' => $parent]);

    RawLedger::expectRejected(fn () => RawLedger::budget($child), 'budgets_top_level_only');
});

it('rejects moving a budgeted category under a parent', function (): void {
    $parent = RawLedger::category();
    $budgeted = RawLedger::category();
    RawLedger::budget($budgeted);

    $reparent = fn () => DB::table('categories')->where('id', $budgeted)->update(['parent_id' => $parent]);

    RawLedger::expectRejected($reparent, 'categories_budgeted_top_level_only');
    RawLedger::expectRejected($reparent, 'has budgets and cannot become a subcategory');
});

function raisedConstraintName(string $statement): string
{
    DB::statement(sprintf(<<<'SQL'
        DO $$
        DECLARE
            raised_constraint text;
        BEGIN
            %s;
        EXCEPTION WHEN check_violation THEN
            GET STACKED DIAGNOSTICS raised_constraint = CONSTRAINT_NAME;
            PERFORM set_config('test.raised_constraint', raised_constraint, true);
        END
        $$
        SQL, $statement));

    return DB::selectOne("SELECT current_setting('test.raised_constraint', true) AS name")->name;
}

it('names the violated top-level budget constraint in the diagnostics', function (): void {
    $parent = RawLedger::category();
    $child = RawLedger::category(['parent_id' => $parent]);
    $budgeted = RawLedger::category();
    RawLedger::budget($budgeted);

    expect(raisedConstraintName("INSERT INTO budgets (category_id, amount_cents, effective_from) VALUES ({$child}, 100, '2026-07')"))
        ->toBe('budgets_top_level_only')
        ->and(raisedConstraintName("UPDATE categories SET parent_id = {$parent} WHERE id = {$budgeted}"))
        ->toBe('categories_budgeted_top_level_only');
});

it('rejects a budget on an unknown category', function (): void {
    RawLedger::expectRejected(fn () => RawLedger::budget(999_999), 'budgets_category_kind_fk');
});

it('rejects a second budget for the same category and period', function (): void {
    $category = RawLedger::category();
    RawLedger::budget($category, '2026-07');

    RawLedger::expectRejected(
        fn () => RawLedger::budget($category, '2026-07', ['amount_cents' => 1]),
        'budgets_category_effective_from_unique',
    );
});

it('rejects an invalid budget', function (array $overrides, string $constraint): void {
    $category = RawLedger::category();

    RawLedger::expectRejected(fn () => RawLedger::budget($category, '2026-07', $overrides), $constraint);
})->with([
    'negative amount' => [['amount_cents' => -1], 'budgets_amount_not_negative'],
    'month 13' => [['effective_from' => '2026-13'], 'budgets_effective_from_format'],
    'month 00' => [['effective_from' => '2026-00'], 'budgets_effective_from_format'],
    'short month' => [['effective_from' => '2026-7'], 'budgets_effective_from_format'],
]);

it('rejects writing the generated category kind', function (): void {
    $category = RawLedger::category();

    RawLedger::expectRejected(
        fn () => RawLedger::budget($category, '2026-07', ['category_kind' => 'income']),
        'category_kind',
    );
});

it('deletes the budgets of a deleted category', function (): void {
    $category = RawLedger::category();
    RawLedger::budget($category, '2026-07');
    RawLedger::budget($category, '2026-09');

    DB::table('categories')->where('id', $category)->delete();

    expect(DB::table('budgets')->count())->toBe(0);
});
