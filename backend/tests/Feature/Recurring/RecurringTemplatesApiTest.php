<?php

declare(strict_types=1);

use App\Actions\Recurring\GenerateRecurringTransactions;
use App\Enums\DraftStatus;
use App\Enums\OccurrenceStatus;
use App\Models\Account;
use App\Models\Category;
use App\Models\Draft;
use App\Models\RecurringOccurrence;
use App\Models\RecurringTemplate;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());

    $this->checking = Account::factory()->openedOn(day('2026-01-01'))->create(['name' => 'BBVA']);
    $this->housing = Category::factory()->create(['name' => 'Vivienda']);
    $this->power = Category::factory()->childOf($this->housing)->create(['name' => 'Electricidad']);
    $this->salary = Category::factory()->income()->create(['name' => 'Nómina']);
});

/**
 * @return array<string, mixed>
 */
function templatePayload(array $overrides = []): array
{
    return [
        'name' => 'Luz',
        'type' => 'expense',
        'amount_cents' => 6000,
        'is_variable' => true,
        'account_id' => test()->checking->id,
        'category_id' => test()->power->id,
        'frequency' => 'monthly',
        'day_of_month' => 5,
        'starts_on' => '2026-01-01',
        'ends_on' => null,
        'description' => 'Iberdrola',
        'merchant' => 'Iberdrola',
        'note' => null,
        ...$overrides,
    ];
}

function runRecurring(string $asOf): void
{
    app(GenerateRecurringTransactions::class)->handle(day($asOf));
}

it('requires authentication', function (): void {
    auth()->logout();

    $this->getJson('/api/v1/recurring-templates')->assertUnauthorized();
    $this->postJson('/api/v1/recurring-templates', templatePayload())->assertUnauthorized();
    $this->getJson('/api/v1/recurring/forecast')->assertUnauthorized();
});

it('creates a template and returns the contract shape', function (): void {
    $response = $this->postJson('/api/v1/recurring-templates', templatePayload())->assertCreated();

    $template = RecurringTemplate::query()->sole();

    $response->assertExactJson(['data' => [
        'id' => $template->id,
        'name' => 'Luz',
        'type' => 'expense',
        'amount_cents' => 6000,
        'is_variable' => true,
        'account' => ['id' => $this->checking->id, 'name' => 'BBVA', 'type' => 'checking', 'archived' => false],
        'category' => ['id' => $this->power->id, 'name' => 'Electricidad', 'kind' => 'expense', 'parent_id' => $this->housing->id, 'parent_name' => 'Vivienda'],
        'frequency' => 'monthly',
        'day_of_month' => 5,
        'starts_on' => '2026-01-01',
        'ends_on' => null,
        'description' => 'Iberdrola',
        'merchant' => 'Iberdrola',
        'note' => null,
        'paused_at' => null,
        'next_due_date' => '2026-11-05',
        'created_at' => '2026-10-13T10:00:00+02:00',
    ]]);
});

it('defaults starts_on to today and is_variable to false', function (): void {
    $payload = templatePayload();
    unset($payload['starts_on'], $payload['is_variable']);

    $this->postJson('/api/v1/recurring-templates', [...$payload, 'day_of_month' => 13])
        ->assertCreated()
        ->assertJsonPath('data.starts_on', '2026-10-13')
        ->assertJsonPath('data.is_variable', false)
        ->assertJsonPath('data.next_due_date', '2026-10-13');
});

it('trims texts and stores empty texts as null', function (): void {
    $this->postJson('/api/v1/recurring-templates', templatePayload(['name' => '  Luz  ', 'merchant' => '   ', 'note' => ' casa ']))
        ->assertCreated()
        ->assertJsonPath('data.name', 'Luz')
        ->assertJsonPath('data.merchant', null)
        ->assertJsonPath('data.note', 'casa');
});

it('validates the template input', function (array $overrides, string $field): void {
    $this->postJson('/api/v1/recurring-templates', templatePayload($overrides))
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);

    expect(RecurringTemplate::query()->count())->toBe(0);
})->with([
    'missing name' => [['name' => ''], 'name'],
    'long name' => [['name' => str_repeat('a', 81)], 'name'],
    'transfer type' => [['type' => 'transfer'], 'type'],
    'zero amount' => [['amount_cents' => 0], 'amount_cents'],
    'huge amount' => [['amount_cents' => 10_000_000_000], 'amount_cents'],
    'missing account' => [['account_id' => null], 'account_id'],
    'unknown account' => [['account_id' => 999_999], 'account_id'],
    'missing category' => [['category_id' => null], 'category_id'],
    'unknown category' => [['category_id' => 999_999], 'category_id'],
    'weekly' => [['frequency' => 'weekly'], 'frequency'],
    'day 0' => [['day_of_month' => 0], 'day_of_month'],
    'day 32' => [['day_of_month' => 32], 'day_of_month'],
    'bad start' => [['starts_on' => '2026-13-01'], 'starts_on'],
    'start before 2000' => [['starts_on' => '0001-01-01'], 'starts_on'],
    'ends before start' => [['ends_on' => '2025-12-31'], 'ends_on'],
    'non boolean variable' => [['is_variable' => 'maybe'], 'is_variable'],
]);

it('rejects a category of the other kind', function (): void {
    $this->postJson('/api/v1/recurring-templates', templatePayload(['category_id' => $this->salary->id]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('category_id');

    $this->postJson('/api/v1/recurring-templates', templatePayload(['type' => 'income', 'category_id' => $this->salary->id]))
        ->assertCreated();
});

it('rejects an archived account or category', function (): void {
    $archivedAccount = Account::factory()->archived()->create();
    $archivedCategory = Category::factory()->archived()->create();

    $this->postJson('/api/v1/recurring-templates', templatePayload(['account_id' => $archivedAccount->id]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('account_id');

    $this->postJson('/api/v1/recurring-templates', templatePayload(['category_id' => $archivedCategory->id]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('category_id');
});

it('rejects ends_on before the default start date', function (): void {
    $payload = templatePayload(['ends_on' => '2026-10-12']);
    unset($payload['starts_on']);

    $this->postJson('/api/v1/recurring-templates', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors('ends_on');
});

it('lists live templates by name, hiding paused ones unless asked', function (): void {
    RecurringTemplate::factory()->create(['name' => 'Nómina', 'type' => 'income', 'category_id' => $this->salary->id, 'account_id' => $this->checking->id]);
    RecurringTemplate::factory()->create(['name' => 'alquiler', 'account_id' => $this->checking->id]);
    RecurringTemplate::factory()->paused(CarbonImmutable::now())->create(['name' => 'Gimnasio', 'account_id' => $this->checking->id]);
    RecurringTemplate::factory()->create(['name' => 'Borrada', 'account_id' => $this->checking->id])->delete();

    $this->getJson('/api/v1/recurring-templates')
        ->assertOk()
        ->assertJsonPath('data.*.name', ['alquiler', 'Nómina']);

    $this->getJson('/api/v1/recurring-templates?include_paused=1')
        ->assertOk()
        ->assertJsonPath('data.*.name', ['alquiler', 'Gimnasio', 'Nómina'])
        ->assertJsonPath('data.1.next_due_date', null)
        ->assertJsonPath('data.1.paused_at', '2026-10-13T10:00:00+02:00');

    $this->getJson('/api/v1/recurring-templates?include_paused=yes')->assertUnprocessable();
});

it('shows a template and hides deleted ones', function (): void {
    $template = RecurringTemplate::factory()->create(['account_id' => $this->checking->id]);

    $this->getJson("/api/v1/recurring-templates/{$template->id}")->assertOk()->assertJsonPath('data.id', $template->id);

    $template->delete();

    $this->getJson("/api/v1/recurring-templates/{$template->id}")->assertNotFound();
});

it('updates any field and only affects occurrences not yet generated', function (): void {
    $id = $this->postJson('/api/v1/recurring-templates', templatePayload(['is_variable' => false, 'starts_on' => '2026-10-01']))->json('data.id');
    runRecurring('2026-10-13');

    $this->patchJson("/api/v1/recurring-templates/{$id}", [
        'amount_cents' => 6500, 'day_of_month' => 31, 'name' => 'Electricidad', 'merchant' => null, 'frequency' => 'quarterly',
    ])
        ->assertOk()
        ->assertJsonPath('data.amount_cents', 6500)
        ->assertJsonPath('data.day_of_month', 31)
        ->assertJsonPath('data.frequency', 'quarterly')
        ->assertJsonPath('data.merchant', null)
        ->assertJsonPath('data.next_due_date', '2027-01-31');

    expect(Transaction::query()->sole()->amount_cents)->toBe(-6000);

    runRecurring('2027-01-31');

    expect(Transaction::query()->orderByDesc('id')->first()?->amount_cents)->toBe(-6500)
        ->and(Transaction::query()->count())->toBe(2);
});

it('allows changing the type before any occurrence and locks it afterwards', function (): void {
    $id = $this->postJson('/api/v1/recurring-templates', templatePayload(['starts_on' => '2026-10-01']))->json('data.id');

    $this->patchJson("/api/v1/recurring-templates/{$id}", ['type' => 'income'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('category_id');

    $this->patchJson("/api/v1/recurring-templates/{$id}", ['type' => 'income', 'category_id' => $this->salary->id])
        ->assertOk()
        ->assertJsonPath('data.type', 'income');

    runRecurring('2026-10-13');

    $this->patchJson("/api/v1/recurring-templates/{$id}", ['type' => 'expense', 'category_id' => $this->power->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('type');

    $this->patchJson("/api/v1/recurring-templates/{$id}", ['type' => 'income', 'amount_cents' => 7000])
        ->assertOk();
});

it('validates updates', function (array $payload, string $field): void {
    $id = $this->postJson('/api/v1/recurring-templates', templatePayload())->json('data.id');

    $this->patchJson("/api/v1/recurring-templates/{$id}", $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);
})->with([
    'ends before start' => [['ends_on' => '2025-06-01'], 'ends_on'],
    'start after end' => [['ends_on' => '2026-03-31', 'starts_on' => '2026-04-01'], 'ends_on'],
    'day 32' => [['day_of_month' => 32], 'day_of_month'],
    'start before 2000' => [['starts_on' => '1999-12-31'], 'starts_on'],
    'null name' => [['name' => null], 'name'],
    'unknown category' => [['category_id' => 0], 'category_id'],
]);

it('rejects moving a template to an archived account but keeps an already archived category', function (): void {
    $id = $this->postJson('/api/v1/recurring-templates', templatePayload())->json('data.id');
    $archived = Account::factory()->archived()->create();

    $this->patchJson("/api/v1/recurring-templates/{$id}", ['account_id' => $archived->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('account_id');

    $this->power->update(['archived_at' => CarbonImmutable::now()]);

    $this->patchJson("/api/v1/recurring-templates/{$id}", ['amount_cents' => 7000, 'category_id' => $this->power->id])
        ->assertOk();
});

it('pauses and resumes without backfilling the slots due while paused', function (): void {
    $id = $this->postJson('/api/v1/recurring-templates', templatePayload(['is_variable' => false, 'starts_on' => '2026-10-01']))->json('data.id');
    runRecurring('2026-10-13');

    $this->postJson("/api/v1/recurring-templates/{$id}/pause")
        ->assertOk()
        ->assertJsonPath('data.paused_at', '2026-10-13T10:00:00+02:00')
        ->assertJsonPath('data.next_due_date', null);

    $this->travelTo(CarbonImmutable::parse('2027-01-20 09:00', 'Europe/Madrid'));

    $this->postJson("/api/v1/recurring-templates/{$id}/resume")
        ->assertOk()
        ->assertJsonPath('data.paused_at', null)
        ->assertJsonPath('data.next_due_date', '2027-02-05');

    runRecurring('2027-01-20');

    $statuses = RecurringOccurrence::query()->orderBy('slot_month')->pluck('status', 'slot_month')
        ->map(fn (OccurrenceStatus $status): string => $status->value)->all();

    expect($statuses)->toBe([
        '2026-10' => 'posted',
        '2026-11' => 'skipped',
        '2026-12' => 'skipped',
        '2027-01' => 'skipped',
    ])->and(Transaction::query()->count())->toBe(1);

    runRecurring('2027-02-05');

    expect(Transaction::query()->count())->toBe(2);
});

it('treats pause and resume as idempotent', function (): void {
    $id = $this->postJson('/api/v1/recurring-templates', templatePayload())->json('data.id');

    $this->postJson("/api/v1/recurring-templates/{$id}/resume")->assertOk()->assertJsonPath('data.paused_at', null);
    $this->postJson("/api/v1/recurring-templates/{$id}/pause")->assertOk();
    $this->travelTo(CarbonImmutable::parse('2026-10-20 10:00', 'Europe/Madrid'));
    $this->postJson("/api/v1/recurring-templates/{$id}/pause")->assertOk()->assertJsonPath('data.paused_at', '2026-10-13T10:00:00+02:00');
});

it('soft-deletes a template, keeps its movements and discards its pending drafts', function (): void {
    $fixedId = $this->postJson('/api/v1/recurring-templates', templatePayload(['is_variable' => false, 'name' => 'Alquiler', 'starts_on' => '2026-10-01']))->json('data.id');
    $variableId = $this->postJson('/api/v1/recurring-templates', templatePayload(['starts_on' => '2026-10-01']))->json('data.id');
    runRecurring('2026-10-13');

    $this->deleteJson("/api/v1/recurring-templates/{$fixedId}")->assertNoContent();
    $this->deleteJson("/api/v1/recurring-templates/{$variableId}")->assertNoContent();

    expect(RecurringTemplate::query()->count())->toBe(0)
        ->and(RecurringTemplate::withTrashed()->count())->toBe(2)
        ->and(Transaction::query()->count())->toBe(1)
        ->and(Draft::query()->sole()->status)->toBe(DraftStatus::Discarded)
        ->and(RecurringOccurrence::query()->where('template_id', $variableId)->sole()->status)->toBe(OccurrenceStatus::Skipped);

    runRecurring('2026-12-31');

    expect(RecurringOccurrence::query()->count())->toBe(2);

    $this->deleteJson("/api/v1/recurring-templates/{$fixedId}")->assertNotFound();
    $this->artisan('app:ledger:verify')->assertSuccessful();
});

it('blocks deleting a category used by a template, even a deleted one', function (): void {
    $template = RecurringTemplate::factory()->create(['account_id' => $this->checking->id, 'category_id' => $this->power->id]);

    $this->deleteJson("/api/v1/categories/{$this->power->id}")
        ->assertConflict()
        ->assertJsonPath('code', 'category_in_use');

    $template->delete();

    $this->deleteJson("/api/v1/categories/{$this->power->id}")
        ->assertConflict()
        ->assertJsonPath('code', 'category_in_use');
});

it('soft-deletes the templates of a deleted account', function (): void {
    $empty = Account::factory()->openedOn(day('2026-01-01'))->create();
    RecurringTemplate::factory()->create(['account_id' => $empty->id]);

    $this->deleteJson("/api/v1/accounts/{$empty->id}")->assertNoContent();

    expect(RecurringTemplate::query()->count())->toBe(0)
        ->and(RecurringTemplate::withTrashed()->count())->toBe(1);
});

it('discards the pending variable drafts of a deleted account and keeps the ledger valid', function (): void {
    $empty = Account::factory()->openedOn(day('2026-01-01'))->create();
    $this->postJson('/api/v1/recurring-templates', templatePayload(['account_id' => $empty->id, 'starts_on' => '2026-10-01']))->assertCreated();
    runRecurring('2026-10-13');

    $draft = Draft::query()->sole();

    $this->deleteJson("/api/v1/accounts/{$empty->id}")->assertNoContent();

    expect($draft->refresh()->status)->toBe(DraftStatus::Discarded)
        ->and(RecurringOccurrence::query()->sole()->status)->toBe(OccurrenceStatus::Skipped);
    $this->artisan('app:ledger:verify')->assertSuccessful();
});

it('lists recurring drafts in the inbox with their recurring block', function (): void {
    $id = $this->postJson('/api/v1/recurring-templates', templatePayload(['starts_on' => '2026-10-01']))->json('data.id');
    runRecurring('2026-10-13');

    $this->getJson('/api/v1/drafts?origin[]=recurring')
        ->assertOk()
        ->assertJsonPath('meta.total', 1)
        ->assertJsonPath('data.0.recurring.template_id', $id)
        ->assertJsonPath('data.0.recurring.due_date', '2026-10-05')
        ->assertJsonPath('data.0.field_sources.amount_cents', 'template')
        ->assertJsonPath('data.0.low_confidence_fields', ['amount_cents']);
});
