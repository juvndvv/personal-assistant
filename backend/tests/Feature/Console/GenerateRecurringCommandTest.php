<?php

declare(strict_types=1);

use App\Models\Account;
use App\Models\Category;
use App\Models\Draft;
use App\Models\RecurringTemplate;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\DB;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 06:00', 'Europe/Madrid'));

    $this->checking = Account::factory()->openedOn(day('2026-01-01'))->create();
    $this->category = Category::factory()->create();
});

it('generates the due occurrences as of today by default', function (): void {
    RecurringTemplate::factory()->create([
        'account_id' => $this->checking->id, 'category_id' => $this->category->id, 'day_of_month' => 5, 'starts_on' => day('2026-09-01'),
    ]);
    RecurringTemplate::factory()->variable()->create([
        'account_id' => $this->checking->id, 'category_id' => $this->category->id, 'day_of_month' => 13, 'starts_on' => day('2026-10-01'),
    ]);

    $this->artisan('app:recurring:generate')
        ->expectsOutputToContain('Recurring as of 2026-10-13: 2 posted, 1 awaiting amount, 0 skipped.')
        ->assertSuccessful();

    $this->artisan('app:recurring:generate')
        ->expectsOutputToContain('0 posted, 0 awaiting amount, 0 skipped.')
        ->assertSuccessful();

    expect(Transaction::query()->count())->toBe(2)
        ->and(Draft::query()->count())->toBe(1);
});

it('catches up to the given date', function (): void {
    RecurringTemplate::factory()->create([
        'account_id' => $this->checking->id, 'category_id' => $this->category->id, 'day_of_month' => 31, 'starts_on' => day('2026-10-01'),
    ]);

    $this->artisan('app:recurring:generate', ['--date' => '2027-01-15'])
        ->expectsOutputToContain('Recurring as of 2027-01-15: 3 posted')
        ->assertSuccessful();

    $dates = Transaction::query()->orderBy('date')->pluck('date')->map(fn (CarbonImmutable $date): string => $date->toDateString())->all();

    expect($dates)->toBe(['2026-10-31', '2026-11-30', '2026-12-31']);
});

it('rejects an invalid date', function (string $date): void {
    $this->artisan('app:recurring:generate', ['--date' => $date])
        ->expectsOutputToContain('The --date option must be a YYYY-MM-DD date.')
        ->assertFailed();
})->with(['2026-02-30', 'tomorrow', '13/10/2026']);

it('reports occurrences that could not be generated and exits with failure', function (): void {
    $template = RecurringTemplate::factory()->create([
        'account_id' => $this->checking->id, 'category_id' => $this->category->id, 'day_of_month' => 5, 'starts_on' => day('2026-10-01'),
    ]);
    DB::statement(<<<'SQL'
        CREATE FUNCTION reject_recurring_transactions() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'rejected for the test';
        END;
        $$
        SQL);
    DB::statement('CREATE TRIGGER reject_recurring_transactions BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION reject_recurring_transactions()');

    $this->artisan('app:recurring:generate')
        ->expectsOutputToContain("Template {$template->id} slot 2026-10")
        ->expectsOutputToContain('1 occurrence(s) failed.')
        ->assertFailed();

    expect($template->occurrences()->count())->toBe(0);
});

it('is scheduled daily at 06:00 Madrid time without overlapping', function (): void {
    $events = collect(app(Schedule::class)->events())
        ->filter(fn (Event $event): bool => str_contains((string) $event->command, 'app:recurring:generate'));

    expect($events)->toHaveCount(1);

    $event = $events->first();

    expect($event->expression)->toBe('0 6 * * *')
        ->and($event->timezone)->toBe('Europe/Madrid')
        ->and($event->withoutOverlapping)->toBeTrue();
});
