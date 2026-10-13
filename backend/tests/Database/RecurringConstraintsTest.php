<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\RawLedger;

it('accepts a valid template and occurrence', function (): void {
    RawLedger::expectAccepted(function (): void {
        $template = RawLedger::recurringTemplate(['ends_on' => '2026-12-31', 'is_variable' => true]);
        RawLedger::occurrence($template, '2026-03', ['status' => 'awaiting_amount']);
    });

    expect(DB::table('recurring_templates')->value('category_kind'))->toBe('expense');
});

it('rejects a second occurrence for the same template and slot month', function (): void {
    $template = RawLedger::recurringTemplate();
    RawLedger::occurrence($template, '2026-03');

    RawLedger::expectRejected(
        fn () => RawLedger::occurrence($template, '2026-03', ['due_date' => '2026-03-20']),
        'recurring_occurrences_template_slot_unique',
    );

    expect(DB::table('recurring_occurrences')->count())->toBe(1);
});

it('lets ON CONFLICT DO NOTHING return no row for an existing slot', function (): void {
    $template = RawLedger::recurringTemplate();
    RawLedger::occurrence($template, '2026-03');

    $row = DB::selectOne(<<<'SQL'
        INSERT INTO recurring_occurrences (template_id, slot_month, due_date, status, created_at, updated_at)
        VALUES (?, '2026-03', '2026-03-05', 'posted', now(), now())
        ON CONFLICT (template_id, slot_month) DO NOTHING
        RETURNING id
        SQL, [$template]);

    expect($row)->toBeNull();
});

it('rejects an invalid template', function (array $overrides, string $constraint): void {
    RawLedger::expectRejected(fn () => RawLedger::recurringTemplate($overrides), $constraint);
})->with([
    'zero amount' => [['amount_cents' => 0], 'recurring_templates_amount_positive'],
    'day 0' => [['day_of_month' => 0], 'recurring_templates_day_of_month_range'],
    'day 32' => [['day_of_month' => 32], 'recurring_templates_day_of_month_range'],
    'unknown frequency' => [['frequency' => 'weekly'], 'recurring_templates_frequency_check'],
    'transfer type' => [['type' => 'transfer'], 'recurring_templates_type_check'],
    'ends before start' => [['starts_on' => '2026-05-01', 'ends_on' => '2026-04-30'], 'recurring_templates_ends_after_start'],
]);

it('rejects a template whose category has the other kind', function (): void {
    $income = RawLedger::category(['kind' => 'income']);

    RawLedger::expectRejected(
        fn () => RawLedger::recurringTemplate(['type' => 'expense', 'category_id' => $income]),
        'recurring_templates_category_kind_fk',
    );
});

it('rejects deleting a category that a template uses', function (): void {
    $category = RawLedger::category();
    RawLedger::recurringTemplate(['category_id' => $category]);

    RawLedger::expectRejected(
        fn () => DB::table('categories')->where('id', $category)->delete(),
        'recurring_templates_category_kind_fk',
    );
});

it('rejects an invalid occurrence', function (string $slotMonth, array $overrides, string $constraint): void {
    $template = RawLedger::recurringTemplate();

    RawLedger::expectRejected(fn () => RawLedger::occurrence($template, $slotMonth, $overrides), $constraint);
})->with([
    'month 13' => ['2026-13', ['due_date' => '2026-12-05'], 'recurring_occurrences_slot_month_format'],
    'short month' => ['2026-3', ['due_date' => '2026-03-05'], 'recurring_occurrences_slot_month_format'],
    'unknown status' => ['2026-03', ['status' => 'pending'], 'recurring_occurrences_status_check'],
]);

it('allows one transaction per occurrence', function (): void {
    $account = RawLedger::account();
    $category = RawLedger::category();
    $occurrence = RawLedger::occurrence(RawLedger::recurringTemplate());
    $row = ['account_id' => $account, 'category_id' => $category, 'origin' => 'recurring', 'recurring_occurrence_id' => $occurrence];
    RawLedger::transaction($row);

    RawLedger::expectRejected(fn () => RawLedger::transaction($row), 'transactions_recurring_occurrence_unique');
});

it('requires recurring drafts to link an occurrence and only them', function (): void {
    $occurrence = RawLedger::occurrence(RawLedger::recurringTemplate(), '2026-03', ['status' => 'awaiting_amount']);

    RawLedger::expectAccepted(fn () => DB::table('drafts')->insert([
        'origin' => 'recurring', 'recurring_occurrence_id' => $occurrence, 'created_at' => now(), 'updated_at' => now(),
    ]));

    RawLedger::expectRejected(fn () => DB::table('drafts')->insert([
        'origin' => 'recurring', 'created_at' => now(), 'updated_at' => now(),
    ]), 'drafts_recurring_origin');

    $other = RawLedger::occurrence(RawLedger::recurringTemplate(), '2026-04');
    $captureId = strtolower((string) Str::ulid());
    DB::table('captures')->insert(['id' => $captureId, 'kind' => 'voice', 'created_at' => now(), 'updated_at' => now()]);

    RawLedger::expectRejected(fn () => DB::table('drafts')->insert([
        'origin' => 'voice', 'capture_id' => $captureId, 'recurring_occurrence_id' => $other, 'created_at' => now(), 'updated_at' => now(),
    ]), 'drafts_recurring_origin');

    RawLedger::expectRejected(fn () => DB::table('drafts')->insert([
        'origin' => 'recurring', 'recurring_occurrence_id' => $occurrence, 'created_at' => now(), 'updated_at' => now(),
    ]), 'drafts_recurring_occurrence_unique');
});
