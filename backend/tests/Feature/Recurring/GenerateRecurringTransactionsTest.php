<?php

declare(strict_types=1);

use App\Actions\Recurring\GenerateRecurringTransactions;
use App\Domain\Recurring\GenerationReport;
use App\Domain\Recurring\RecurrenceSlot;
use App\Enums\DraftOrigin;
use App\Enums\DraftStatus;
use App\Enums\DraftType;
use App\Enums\OccurrenceStatus;
use App\Enums\RecurringFrequency;
use App\Enums\TransactionOrigin;
use App\Enums\TransactionType;
use App\Models\Account;
use App\Models\Category;
use App\Models\Draft;
use App\Models\RecurringOccurrence;
use App\Models\RecurringTemplate;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Tests\Support\Ledger;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());

    $this->checking = Account::factory()->openedOn(day('2026-01-01'), 100_000)->create(['name' => 'BBVA']);
    $this->rent = Category::factory()->create(['name' => 'Alquiler']);
    $this->power = Category::factory()->create(['name' => 'Electricidad']);
    $this->salary = Category::factory()->income()->create(['name' => 'Nómina']);
});

function generateRecurring(string $asOf): GenerationReport
{
    return app(GenerateRecurringTransactions::class)->handle(day($asOf));
}

/**
 * @param  array<string, mixed>  $attributes
 */
function recurringTemplate(array $attributes = []): RecurringTemplate
{
    return RecurringTemplate::factory()->create([
        'name' => 'Alquiler',
        'amount_cents' => 80_000,
        'account_id' => test()->checking->id,
        'category_id' => test()->rent->id,
        'day_of_month' => 5,
        'starts_on' => day('2026-10-01'),
        ...$attributes,
    ]);
}

/**
 * @return array<string, string>
 */
function occurrenceStatuses(RecurringTemplate $template): array
{
    return $template->occurrences()
        ->orderBy('slot_month')
        ->get()
        ->mapWithKeys(fn (RecurringOccurrence $occurrence): array => [
            $occurrence->due_date->toDateString() => $occurrence->status->value,
        ])
        ->all();
}

it('posts a fixed monthly template as a confirmed recurring movement on its date', function (): void {
    $template = recurringTemplate(['description' => 'Piso centro', 'merchant' => 'Inmobiliaria', 'note' => 'Contrato 2026']);

    $report = generateRecurring('2026-10-13');

    $transaction = Transaction::query()->sole();
    $occurrence = RecurringOccurrence::query()->sole();

    expect($report->posted)->toBe(1)
        ->and($report->awaitingAmount)->toBe(0)
        ->and($report->skipped)->toBe(0)
        ->and($report->failures)->toBe([])
        ->and($transaction->type)->toBe(TransactionType::Expense)
        ->and($transaction->origin)->toBe(TransactionOrigin::Recurring)
        ->and($transaction->amount_cents)->toBe(-80_000)
        ->and($transaction->date->toDateString())->toBe('2026-10-05')
        ->and($transaction->account_id)->toBe($this->checking->id)
        ->and($transaction->category_id)->toBe($this->rent->id)
        ->and($transaction->description)->toBe('Piso centro')
        ->and($transaction->merchant)->toBe('Inmobiliaria')
        ->and($transaction->note)->toBe('Contrato 2026')
        ->and($transaction->recurring_occurrence_id)->toBe($occurrence->id)
        ->and($occurrence->template_id)->toBe($template->id)
        ->and($occurrence->slot_month)->toBe('2026-10')
        ->and($occurrence->due_date->toDateString())->toBe('2026-10-05')
        ->and($occurrence->status)->toBe(OccurrenceStatus::Posted)
        ->and(Ledger::balance($this->checking))->toBe(20_000);
});

it('uses the template name as description when it has none', function (): void {
    recurringTemplate(['name' => 'Gimnasio', 'description' => null]);

    generateRecurring('2026-10-13');

    expect(Transaction::query()->sole()->description)->toBe('Gimnasio');
});

it('posts income templates with a positive amount', function (): void {
    recurringTemplate(['type' => 'income', 'category_id' => $this->salary->id, 'amount_cents' => 210_000, 'day_of_month' => 1]);

    generateRecurring('2026-10-13');

    $transaction = Transaction::query()->sole();

    expect($transaction->type)->toBe(TransactionType::Income)
        ->and($transaction->amount_cents)->toBe(210_000)
        ->and($transaction->date->toDateString())->toBe('2026-10-01');
});

it('does not post a slot before its due date', function (): void {
    recurringTemplate(['day_of_month' => 20]);

    expect(generateRecurring('2026-10-19')->posted)->toBe(0)
        ->and(Transaction::query()->count())->toBe(0)
        ->and(generateRecurring('2026-10-20')->posted)->toBe(1)
        ->and(Transaction::query()->sole()->date->toDateString())->toBe('2026-10-20');
});

it('never duplicates when the generator runs again', function (): void {
    $monthly = recurringTemplate(['starts_on' => day('2026-07-01')]);
    $quarterly = recurringTemplate(['frequency' => RecurringFrequency::Quarterly, 'day_of_month' => 10, 'starts_on' => day('2026-02-01')]);
    $yearly = recurringTemplate(['frequency' => RecurringFrequency::Yearly, 'day_of_month' => 31, 'starts_on' => day('2026-03-01')]);

    $first = generateRecurring('2026-10-13');
    $second = generateRecurring('2026-10-13');

    expect($first->posted)->toBe(8)
        ->and($second->posted)->toBe(0)
        ->and($second->skipped)->toBe(0)
        ->and(Transaction::query()->count())->toBe(8)
        ->and(RecurringOccurrence::query()->count())->toBe(8)
        ->and(array_keys(occurrenceStatuses($monthly)))->toBe(['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05'])
        ->and(array_keys(occurrenceStatuses($quarterly)))->toBe(['2026-02-10', '2026-05-10', '2026-08-10'])
        ->and(array_keys(occurrenceStatuses($yearly)))->toBe(['2026-03-31']);

    $dates = Transaction::query()->orderBy('date')->pluck('date')->map(fn (CarbonImmutable $date): string => $date->toDateString())->all();

    expect($dates)->toBe([
        '2026-02-10', '2026-03-31', '2026-05-10', '2026-07-05', '2026-08-05', '2026-08-10', '2026-09-05', '2026-10-05',
    ]);
});

it('catches up every missed slot after downtime with its own date, clamping day 31', function (): void {
    recurringTemplate(['day_of_month' => 31, 'starts_on' => day('2026-07-01')]);

    $report = generateRecurring('2026-10-13');

    $dates = Transaction::query()->orderBy('date')->pluck('date')->map(fn (CarbonImmutable $date): string => $date->toDateString())->all();

    expect($report->posted)->toBe(3)
        ->and($dates)->toBe(['2026-07-31', '2026-08-31', '2026-09-30']);
});

it('catches up at most 36 slots per template in one run and the rest in the next', function (): void {
    $this->checking->update(['opening_date' => day('2020-01-01')]);
    $template = recurringTemplate(['starts_on' => day('2023-01-01')]);

    expect(generateRecurring('2026-10-13')->posted)->toBe(36)
        ->and($template->occurrences()->max('slot_month'))->toBe('2025-12')
        ->and(generateRecurring('2026-10-13')->posted)->toBe(10)
        ->and(Transaction::query()->count())->toBe(46);
});

it('does not create a second movement when another run already inserted the occurrence', function (): void {
    $template = recurringTemplate();
    DB::table('recurring_occurrences')->insert([
        'template_id' => $template->id, 'slot_month' => '2026-10', 'due_date' => '2026-10-05', 'status' => 'posted',
        'created_at' => now(), 'updated_at' => now(),
    ]);

    $occurrence = app(GenerateRecurringTransactions::class)->generateSlot($template, new RecurrenceSlot('2026-10', day('2026-10-05')));

    expect($occurrence)->toBeNull()
        ->and(Transaction::query()->count())->toBe(0)
        ->and(RecurringOccurrence::query()->count())->toBe(1);
});

it('does not regenerate a generated movement that was soft-deleted', function (): void {
    recurringTemplate();
    generateRecurring('2026-10-13');
    $transaction = Transaction::query()->sole();

    $this->deleteJson("/api/v1/transactions/{$transaction->id}")->assertNoContent();

    generateRecurring('2026-10-14');

    expect(Transaction::query()->count())->toBe(0)
        ->and(Transaction::withTrashed()->count())->toBe(1)
        ->and(RecurringOccurrence::query()->sole()->status)->toBe(OccurrenceStatus::Posted);
});

it('does not duplicate when day_of_month changes mid-period', function (): void {
    $template = recurringTemplate();
    generateRecurring('2026-10-13');

    $this->patchJson("/api/v1/recurring-templates/{$template->id}", ['day_of_month' => 20])->assertOk();
    $this->travelTo(CarbonImmutable::parse('2026-10-25 10:00', 'Europe/Madrid'));

    expect(generateRecurring('2026-10-25')->posted)->toBe(0)
        ->and(Transaction::query()->count())->toBe(1);

    expect(generateRecurring('2026-11-20')->posted)->toBe(1)
        ->and(Transaction::query()->orderByDesc('date')->first()?->date->toDateString())->toBe('2026-11-20');
});

it('does not duplicate when month_start_day changes mid-period', function (): void {
    recurringTemplate(['day_of_month' => 26]);
    generateRecurring('2026-10-13');
    generateRecurring('2026-10-26');

    $this->patchJson('/api/v1/settings', ['month_start_day' => 25])->assertOk();

    expect(generateRecurring('2026-10-27')->posted)->toBe(0)
        ->and(Transaction::query()->count())->toBe(1);
});

it('creates only a pending draft for a variable template', function (): void {
    $template = recurringTemplate([
        'name' => 'Luz', 'is_variable' => true, 'amount_cents' => 6_000, 'category_id' => $this->power->id,
        'description' => 'Iberdrola', 'merchant' => 'Iberdrola',
    ]);

    $report = generateRecurring('2026-10-13');

    $draft = Draft::query()->sole();
    $occurrence = RecurringOccurrence::query()->sole();

    expect($report->awaitingAmount)->toBe(1)
        ->and($report->posted)->toBe(0)
        ->and(Transaction::query()->count())->toBe(0)
        ->and(Ledger::balance($this->checking))->toBe(100_000)
        ->and($occurrence->status)->toBe(OccurrenceStatus::AwaitingAmount)
        ->and($draft->origin)->toBe(DraftOrigin::Recurring)
        ->and($draft->status)->toBe(DraftStatus::Pending)
        ->and($draft->recurring_occurrence_id)->toBe($occurrence->id)
        ->and($draft->capture_id)->toBeNull()
        ->and($draft->proposal())->toBe([
            'type' => 'expense',
            'amount_cents' => 6_000,
            'date' => '2026-10-05',
            'account_id' => $this->checking->id,
            'to_account_id' => null,
            'category_id' => $this->power->id,
            'description' => 'Iberdrola',
            'merchant' => 'Iberdrola',
        ])
        ->and($draft->field_sources)->toEqual([
            'type' => 'template', 'amount_cents' => 'template', 'date' => 'template', 'account_id' => 'template',
            'category_id' => 'template', 'description' => 'template', 'merchant' => 'template',
        ])
        ->and($draft->low_confidence_fields)->toBe(['amount_cents'])
        ->and($draft->type)->toBe(DraftType::Expense)
        ->and($template->occurrences()->count())->toBe(1);

    expect(generateRecurring('2026-10-13')->awaitingAmount)->toBe(0)
        ->and(Draft::query()->count())->toBe(1);
});

it('confirms a variable draft with the real amount into a recurring movement and posts the occurrence', function (): void {
    $template = recurringTemplate(['name' => 'Luz', 'is_variable' => true, 'amount_cents' => 6_000, 'category_id' => $this->power->id]);
    generateRecurring('2026-10-13');
    $draft = Draft::query()->sole();

    $this->getJson("/api/v1/drafts/{$draft->id}")
        ->assertOk()
        ->assertJsonPath('data.origin', 'recurring')
        ->assertJsonPath('data.capture', null)
        ->assertJsonPath('data.recurring', [
            'template_id' => $template->id,
            'template_name' => 'Luz',
            'occurrence_id' => $draft->recurring_occurrence_id,
            'due_date' => '2026-10-05',
            'is_variable' => true,
        ]);

    $this->postJson('/api/v1/transactions', [
        'type' => 'expense', 'amount_cents' => 7_345, 'date' => '2026-10-05', 'account_id' => $this->checking->id,
        'category_id' => $this->power->id, 'description' => 'Luz', 'draft_id' => $draft->id,
    ])
        ->assertCreated()
        ->assertJsonPath('data.origin', 'recurring')
        ->assertJsonPath('data.amount_cents', 7_345)
        ->assertJsonPath('data.recurring_template_id', $template->id);

    $transaction = Transaction::query()->sole();
    $draft->refresh();

    expect($transaction->origin)->toBe(TransactionOrigin::Recurring)
        ->and($transaction->recurring_occurrence_id)->toBe($draft->recurring_occurrence_id)
        ->and($draft->status)->toBe(DraftStatus::Confirmed)
        ->and($draft->transaction_id)->toBe($transaction->id)
        ->and($draft->corrected_fields)->toBe(['amount_cents'])
        ->and(RecurringOccurrence::query()->sole()->status)->toBe(OccurrenceStatus::Posted)
        ->and(Ledger::balance($this->checking))->toBe(100_000 - 7_345);

    $this->artisan('app:ledger:verify')->assertSuccessful();
});

it('refuses to confirm a recurring draft as a transfer', function (): void {
    recurringTemplate(['is_variable' => true]);
    generateRecurring('2026-10-13');
    $savings = Account::factory()->openedOn(day('2026-01-01'))->create();

    $this->postJson('/api/v1/transfers', [
        'from_account_id' => $this->checking->id, 'to_account_id' => $savings->id, 'amount_cents' => 6_000,
        'draft_id' => Draft::query()->sole()->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('draft_id');

    expect(RecurringOccurrence::query()->sole()->status)->toBe(OccurrenceStatus::AwaitingAmount);
});

it('skips the occurrence when its variable draft is discarded and never recreates it', function (): void {
    recurringTemplate(['is_variable' => true]);
    generateRecurring('2026-10-13');
    $draft = Draft::query()->sole();

    $this->postJson("/api/v1/drafts/{$draft->id}/discard")->assertOk()->assertJsonPath('data.status', 'discarded');

    expect(RecurringOccurrence::query()->sole()->status)->toBe(OccurrenceStatus::Skipped);

    generateRecurring('2026-10-14');

    expect(Draft::query()->count())->toBe(1)
        ->and(Transaction::query()->count())->toBe(0);

    $this->artisan('app:ledger:verify')->assertSuccessful();
});

it('never enumerates or records slots before the account opening date', function (): void {
    $late = Account::factory()->openedOn(day('2026-09-10'))->create();
    $template = recurringTemplate(['account_id' => $late->id, 'starts_on' => day('2026-08-01')]);

    $report = generateRecurring('2026-10-13');

    expect($report->skipped)->toBe(0)
        ->and($report->posted)->toBe(1)
        ->and(occurrenceStatuses($template))->toBe(['2026-10-05' => 'posted']);
});

it('posts the current slot on the first run when starts_on is years before the account opening date', function (): void {
    $template = recurringTemplate(['starts_on' => day('2020-01-01')]);

    $report = generateRecurring('2026-10-14');

    expect($report->posted)->toBe(10)
        ->and($report->skipped)->toBe(0)
        ->and($template->occurrences()->min('slot_month'))->toBe('2026-01')
        ->and($template->occurrences()->max('slot_month'))->toBe('2026-10');
});

it('does not backfill past slots after changing the frequency of a template with occurrences', function (): void {
    $this->checking->update(['opening_date' => day('2025-01-01')]);
    $template = recurringTemplate([
        'frequency' => RecurringFrequency::Yearly, 'starts_on' => day('2025-01-10'), 'day_of_month' => 10,
    ]);
    $this->travelTo(CarbonImmutable::parse('2026-10-14 10:00', 'Europe/Madrid'));

    expect(generateRecurring('2026-10-14')->posted)->toBe(2);

    $this->patchJson("/api/v1/recurring-templates/{$template->id}", ['frequency' => 'monthly'])
        ->assertOk()
        ->assertJsonPath('data.next_due_date', '2026-11-10');

    generateRecurring('2026-10-14');
    generateRecurring('2026-11-10');

    expect(array_keys(occurrenceStatuses($template)))->toBe(['2025-01-10', '2026-01-10', '2026-10-10', '2026-11-10'])
        ->and(Transaction::query()->count())->toBe(4);
});

it('does not post past slots after moving the anchor month of a quarterly template with occurrences', function (): void {
    $template = recurringTemplate(['frequency' => RecurringFrequency::Quarterly, 'starts_on' => day('2026-01-01')]);
    generateRecurring('2026-10-13');

    $this->patchJson("/api/v1/recurring-templates/{$template->id}", ['starts_on' => '2026-02-01'])->assertOk();

    expect(generateRecurring('2026-10-13')->posted)->toBe(0);

    $this->getJson('/api/v1/recurring/forecast?period=2026-08')
        ->assertOk()
        ->assertJsonPath('data.items', []);

    generateRecurring('2026-11-05');

    expect(array_keys(occurrenceStatuses($template)))->toBe(['2026-01-05', '2026-04-05', '2026-07-05', '2026-10-05', '2026-11-05']);
});

it('does not backfill the inactive months after extending an ended template', function (): void {
    $template = recurringTemplate(['starts_on' => day('2026-04-01'), 'ends_on' => day('2026-06-30')]);
    generateRecurring('2026-07-01');
    $this->travelTo(CarbonImmutable::parse('2026-10-14 10:00', 'Europe/Madrid'));

    $this->patchJson("/api/v1/recurring-templates/{$template->id}", ['ends_on' => '2026-12-31'])
        ->assertOk();

    generateRecurring('2026-10-14');

    expect(occurrenceStatuses($template))->toBe([
        '2026-04-05' => 'posted',
        '2026-05-05' => 'posted',
        '2026-06-05' => 'posted',
        '2026-10-05' => 'posted',
    ])
        ->and(Transaction::query()->count())->toBe(4);

    $this->getJson('/api/v1/recurring/forecast?period=2026-08')
        ->assertOk()
        ->assertJsonPath('data.items', []);
});

it('does not backfill past slots after moving the account opening date earlier', function (): void {
    $late = Account::factory()->openedOn(day('2026-09-10'))->create();
    $template = recurringTemplate(['account_id' => $late->id, 'starts_on' => day('2026-08-01')]);
    generateRecurring('2026-10-13');

    $this->patchJson("/api/v1/accounts/{$late->id}", ['opening_date' => '2026-08-01'])->assertOk();

    expect(generateRecurring('2026-10-13')->posted)->toBe(0)
        ->and(occurrenceStatuses($template))->toBe(['2026-10-05' => 'posted']);
});

it('records slots of an archived or deleted account as skipped', function (): void {
    $archived = Account::factory()->openedOn(day('2026-01-01'))->archived()->create();
    $deleted = Account::factory()->openedOn(day('2026-01-01'))->create();
    $deleted->delete();
    $onArchived = recurringTemplate(['account_id' => $archived->id]);
    $onDeleted = recurringTemplate(['account_id' => $deleted->id, 'is_variable' => true]);

    $report = generateRecurring('2026-10-13');

    expect($report->skipped)->toBe(2)
        ->and($report->failures)->toBe([])
        ->and(occurrenceStatuses($onArchived))->toBe(['2026-10-05' => 'skipped'])
        ->and(occurrenceStatuses($onDeleted))->toBe(['2026-10-05' => 'skipped'])
        ->and(Transaction::query()->count())->toBe(0)
        ->and(Draft::query()->count())->toBe(0);
});

it('records slots due while paused as skipped and posts the ones due before the pause', function (): void {
    $template = recurringTemplate([
        'starts_on' => day('2026-07-01'),
        'paused_at' => CarbonImmutable::parse('2026-08-15 12:00', 'Europe/Madrid'),
    ]);

    generateRecurring('2026-10-13');

    expect(occurrenceStatuses($template))->toBe([
        '2026-07-05' => 'posted',
        '2026-08-05' => 'posted',
        '2026-09-05' => 'skipped',
        '2026-10-05' => 'skipped',
    ]);
});

it('stops after ends_on and ignores deleted templates', function (): void {
    $ending = recurringTemplate(['starts_on' => day('2026-07-01'), 'ends_on' => day('2026-08-31')]);
    $deleted = recurringTemplate(['starts_on' => day('2026-07-01')]);
    $deleted->delete();

    generateRecurring('2026-10-13');

    expect(array_keys(occurrenceStatuses($ending)))->toBe(['2026-07-05', '2026-08-05'])
        ->and($deleted->occurrences()->count())->toBe(0);
});

it('keeps the ledger invariants after generating fixed and variable occurrences', function (): void {
    recurringTemplate(['starts_on' => day('2026-07-01')]);
    recurringTemplate(['starts_on' => day('2026-07-01'), 'is_variable' => true, 'category_id' => $this->power->id]);

    generateRecurring('2026-10-13');

    $this->artisan('app:ledger:verify')->expectsOutputToContain('Ledger OK')->assertSuccessful();
});

it('creates no draft when the variable template is deleted after the run loaded it', function (): void {
    $template = recurringTemplate(['is_variable' => true, 'category_id' => $this->power->id]);
    $staleSnapshot = RecurringTemplate::query()->with('account')->findOrFail($template->id);

    RecurringTemplate::query()->findOrFail($template->id)->delete();

    $occurrence = app(GenerateRecurringTransactions::class)->generateSlot($staleSnapshot, new RecurrenceSlot('2026-10', day('2026-10-05')));

    expect($occurrence)->toBeNull()
        ->and(Draft::query()->count())->toBe(0)
        ->and(RecurringOccurrence::query()->count())->toBe(0);
});

it('skips the slot when the template is paused on its due day after the run loaded it', function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-05 08:00', 'Europe/Madrid'));
    $template = recurringTemplate();
    $staleSnapshot = RecurringTemplate::query()->with('account')->findOrFail($template->id);

    $template->forceFill(['paused_at' => CarbonImmutable::now()])->save();

    $occurrence = app(GenerateRecurringTransactions::class)->generateSlot($staleSnapshot, new RecurrenceSlot('2026-10', day('2026-10-05')));

    expect($occurrence?->status)->toBe(OccurrenceStatus::Skipped)
        ->and(Transaction::query()->count())->toBe(0);
});

it('skips the slot when the account is archived after the run loaded the template', function (): void {
    $template = recurringTemplate();
    $staleSnapshot = RecurringTemplate::query()->with('account')->findOrFail($template->id);

    $this->checking->update(['archived_at' => CarbonImmutable::now()]);

    $occurrence = app(GenerateRecurringTransactions::class)->generateSlot($staleSnapshot, new RecurrenceSlot('2026-10', day('2026-10-05')));

    expect($occurrence?->status)->toBe(OccurrenceStatus::Skipped)
        ->and(Transaction::query()->count())->toBe(0);
});
