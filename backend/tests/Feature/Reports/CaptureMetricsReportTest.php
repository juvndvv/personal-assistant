<?php

declare(strict_types=1);

use App\Models\Account;
use App\Models\Category;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\Captures;
use Tests\Support\Ledger;
use Tests\Support\Reports;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-14 12:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());

    $this->account = Account::factory()->openedOn(day('2026-01-01'))->create();
    $this->category = Category::factory()->create();
});

function capturedMovement(string $createdAt, string $origin = 'manual', string $date = '2026-10-01'): int
{
    return Ledger::expense(test()->account, 1_000, $date, test()->category, [
        'origin' => $origin,
        'created_at' => CarbonImmutable::parse($createdAt, 'Europe/Madrid'),
    ])->id;
}

/**
 * @param  list<string>|null  $correctedFields
 */
function confirmedCaptureDraft(?string $clientStartedAt, string $createdAt, string $confirmedAt, ?array $correctedFields = [], string $status = 'confirmed'): void
{
    $captureId = (string) Str::ulid();

    DB::table('captures')->insert([
        'id' => $captureId,
        'kind' => 'voice',
        'status' => 'completed',
        'transcript' => 'Veinte euros en Mercadona',
        'client_started_at' => $clientStartedAt === null ? null : CarbonImmutable::parse($clientStartedAt, 'Europe/Madrid'),
        'created_at' => CarbonImmutable::parse($createdAt, 'Europe/Madrid'),
        'updated_at' => CarbonImmutable::parse($createdAt, 'Europe/Madrid'),
    ]);

    DB::table('drafts')->insert([
        'origin' => 'voice',
        'status' => $status,
        'capture_id' => $captureId,
        'corrected_fields' => $correctedFields === null ? null : json_encode($correctedFields),
        'transaction_id' => $status === 'confirmed' ? capturedMovement('2026-10-05 12:00', 'voice') : null,
        'confirmed_at' => $status === 'confirmed' ? CarbonImmutable::parse($confirmedAt, 'Europe/Madrid') : null,
        'discarded_at' => $status === 'discarded' ? CarbonImmutable::parse($confirmedAt, 'Europe/Madrid') : null,
        'created_at' => CarbonImmutable::parse($createdAt, 'Europe/Madrid'),
        'updated_at' => CarbonImmutable::parse($confirmedAt, 'Europe/Madrid'),
    ]);
}

it('reports time to confirm, unedited share and active days for the period', function (): void {
    confirmedCaptureDraft('2026-10-03 09:00:00', '2026-10-03 09:00:02', '2026-10-03 09:00:04');
    confirmedCaptureDraft('2026-10-04 09:00:00', '2026-10-04 09:00:03', '2026-10-04 09:00:06', null);
    confirmedCaptureDraft(null, '2026-10-05 09:00:00', '2026-10-05 09:00:08');
    confirmedCaptureDraft('2026-10-06 09:00:00', '2026-10-06 09:00:04', '2026-10-06 09:00:10', ['amount_cents']);
    confirmedCaptureDraft('2026-10-07 09:00:00', '2026-10-07 09:00:05', '2026-10-07 09:00:30');
    confirmedCaptureDraft('2026-10-08 09:00:00', '2026-10-08 09:00:05', '2026-10-08 09:00:50', [], 'discarded');
    confirmedCaptureDraft('2026-10-08 09:00:00', '2026-10-08 09:00:05', '2026-10-08 09:00:50', [], 'pending');
    confirmedCaptureDraft('2026-09-30 23:59:00', '2026-09-30 23:59:01', '2026-09-30 23:59:59');

    capturedMovement('2026-10-02 10:00');
    capturedMovement('2026-10-02 18:00', 'photo');
    capturedMovement('2026-10-13 23:30');
    capturedMovement('2026-10-07 10:00', 'recurring');
    capturedMovement('2026-09-30 23:30');

    $this->getJson('/api/v1/reports/capture-metrics?period=2026-10')
        ->assertOk()
        ->assertExactJson(['data' => [
            'period' => ['label' => '2026-10', 'start' => '2026-10-01', 'end' => '2026-10-31', 'month_start_day' => 1],
            'captures_confirmed' => 5,
            'median_seconds_to_confirm' => 8.0,
            'p90_seconds_to_confirm' => 22.0,
            'unedited_share_bp' => 8_000,
            'active_days' => 3,
            'elapsed_days' => 14,
            'active_days_per_week' => 1.5,
        ]]);
});

it('ignores transfers and deleted movements when counting active days', function (): void {
    $savings = Account::factory()->openedOn(day('2026-01-01'))->create();
    $this->postJson('/api/v1/transfers', [
        'from_account_id' => $this->account->id,
        'to_account_id' => $savings->id,
        'amount_cents' => 1_000,
        'date' => '2026-10-10',
    ])->assertCreated();
    Ledger::expense($this->account, 500, '2026-10-01', $this->category)->delete();

    $this->getJson('/api/v1/reports/capture-metrics?period=2026-10')
        ->assertOk()
        ->assertJsonPath('data.active_days', 0)
        ->assertJsonPath('data.active_days_per_week', 0);
});

it('uses the configurable period and counts every day of a past period', function (): void {
    Reports::useMonthStartDay(25);
    capturedMovement('2026-09-24 10:00');
    capturedMovement('2026-09-25 10:00');
    capturedMovement('2026-10-24 10:00');

    $this->getJson('/api/v1/reports/capture-metrics?period=2026-09')
        ->assertOk()
        ->assertJsonPath('data.period.start', '2026-08-25')
        ->assertJsonPath('data.active_days', 1)
        ->assertJsonPath('data.elapsed_days', 31)
        ->assertJsonPath('data.active_days_per_week', 0.2);

    $this->getJson('/api/v1/reports/capture-metrics')
        ->assertOk()
        ->assertJsonPath('data.period.label', '2026-10')
        ->assertJsonPath('data.active_days', 1)
        ->assertJsonPath('data.elapsed_days', 20);
});

it('returns nulls when there is nothing to measure', function (): void {
    $this->getJson('/api/v1/reports/capture-metrics?period=2026-12')
        ->assertOk()
        ->assertJsonPath('data.captures_confirmed', 0)
        ->assertJsonPath('data.median_seconds_to_confirm', null)
        ->assertJsonPath('data.p90_seconds_to_confirm', null)
        ->assertJsonPath('data.unedited_share_bp', null)
        ->assertJsonPath('data.active_days', 0)
        ->assertJsonPath('data.elapsed_days', 0)
        ->assertJsonPath('data.active_days_per_week', null);
});

it('measures drafts confirmed through the capture flow', function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-14 12:00:00', 'Europe/Madrid'));
    $draft = Captures::voiceDraft(Captures::extraction([
        'account_id' => $this->account->id,
        'category_id' => $this->category->id,
        'date' => '2026-10-14',
    ]));
    DB::table('captures')->where('id', $draft->capture_id)->update([
        'client_started_at' => CarbonImmutable::parse('2026-10-14 11:59:53', 'Europe/Madrid'),
    ]);

    $this->postJson('/api/v1/transactions', [
        'draft_id' => $draft->id,
        'type' => 'expense',
        'amount_cents' => 2_000,
        'date' => '2026-10-14',
        'account_id' => $this->account->id,
        'category_id' => $this->category->id,
        'description' => 'Mercadona',
        'merchant' => 'Mercadona',
    ])->assertCreated();

    $this->getJson('/api/v1/reports/capture-metrics?period=2026-10')
        ->assertOk()
        ->assertJsonPath('data.captures_confirmed', 1)
        ->assertJsonPath('data.median_seconds_to_confirm', 7)
        ->assertJsonPath('data.unedited_share_bp', 10_000)
        ->assertJsonPath('data.active_days', 1);
});

it('validates the period label', function (string $label): void {
    $this->getJson("/api/v1/reports/capture-metrics?period={$label}")->assertUnprocessable()->assertJsonValidationErrors('period');
})->with(['26-10', '0000-01', '3000-01']);
