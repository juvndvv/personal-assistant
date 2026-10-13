<?php

declare(strict_types=1);

use App\Actions\Recurring\GenerateRecurringTransactions;
use App\Enums\RecurringFrequency;
use App\Models\Account;
use App\Models\Category;
use App\Models\Draft;
use App\Models\RecurringTemplate;
use App\Models\Setting;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());
    Setting::query()->whereKey(Setting::SINGLETON_ID)->update(['month_start_day' => 25]);

    $this->checking = Account::factory()->openedOn(day('2026-01-01'))->create(['name' => 'BBVA']);
    $expense = Category::factory()->create();
    $income = Category::factory()->income()->create();

    $template = fn (array $attributes): RecurringTemplate => RecurringTemplate::factory()->create([
        'account_id' => $this->checking->id,
        'category_id' => $expense->id,
        'starts_on' => day('2026-01-01'),
        ...$attributes,
    ]);

    $this->salary = $template(['name' => 'Nómina', 'type' => 'income', 'category_id' => $income->id, 'amount_cents' => 210_000, 'day_of_month' => 25]);
    $this->rent = $template(['name' => 'Alquiler', 'amount_cents' => 80_000, 'day_of_month' => 1]);
    $this->power = $template(['name' => 'Luz', 'amount_cents' => 6_000, 'day_of_month' => 5, 'is_variable' => true, 'starts_on' => day('2026-10-01')]);
    $this->insurance = $template(['name' => 'Seguro', 'amount_cents' => 12_000, 'day_of_month' => 15, 'frequency' => RecurringFrequency::Yearly, 'starts_on' => day('2026-10-01')]);
    $this->gym = $template(['name' => 'Gimnasio', 'amount_cents' => 3_000, 'day_of_month' => 20]);
    $this->water = $template(['name' => 'Agua', 'amount_cents' => 4_500, 'day_of_month' => 10, 'frequency' => RecurringFrequency::Quarterly, 'starts_on' => day('2026-02-01')]);
    $this->paused = $template(['name' => 'Revista', 'amount_cents' => 900, 'day_of_month' => 18, 'paused_at' => CarbonImmutable::parse('2026-10-01 09:00', 'Europe/Madrid')]);

    app(GenerateRecurringTransactions::class)->handle(day('2026-10-13'));
});

it('lists the occurrences of the current configurable period with pending and posted totals', function (): void {
    $draft = Draft::query()->sole();
    $rentTransaction = Transaction::query()->where('date', '2026-10-01')->sole();
    $salaryTransaction = Transaction::query()->where('date', '2026-09-25')->sole();

    $this->getJson('/api/v1/recurring/forecast')
        ->assertOk()
        ->assertExactJson(['data' => [
            'period' => ['label' => '2026-10', 'start' => '2026-09-25', 'end' => '2026-10-24', 'month_start_day' => 25],
            'items' => [
                ['template_id' => $this->salary->id, 'template_name' => 'Nómina', 'type' => 'income', 'due_date' => '2026-09-25', 'amount_cents' => 210_000,
                    'is_variable' => false, 'status' => 'posted', 'draft_id' => null, 'transaction_id' => $salaryTransaction->id],
                ['template_id' => $this->rent->id, 'template_name' => 'Alquiler', 'type' => 'expense', 'due_date' => '2026-10-01', 'amount_cents' => 80_000,
                    'is_variable' => false, 'status' => 'posted', 'draft_id' => null, 'transaction_id' => $rentTransaction->id],
                ['template_id' => $this->power->id, 'template_name' => 'Luz', 'type' => 'expense', 'due_date' => '2026-10-05', 'amount_cents' => 6_000,
                    'is_variable' => true, 'status' => 'awaiting_amount', 'draft_id' => $draft->id, 'transaction_id' => null],
                ['template_id' => $this->insurance->id, 'template_name' => 'Seguro', 'type' => 'expense', 'due_date' => '2026-10-15', 'amount_cents' => 12_000,
                    'is_variable' => false, 'status' => 'upcoming', 'draft_id' => null, 'transaction_id' => null],
                ['template_id' => $this->paused->id, 'template_name' => 'Revista', 'type' => 'expense', 'due_date' => '2026-10-18', 'amount_cents' => 900,
                    'is_variable' => false, 'status' => 'skipped', 'draft_id' => null, 'transaction_id' => null],
                ['template_id' => $this->gym->id, 'template_name' => 'Gimnasio', 'type' => 'expense', 'due_date' => '2026-10-20', 'amount_cents' => 3_000,
                    'is_variable' => false, 'status' => 'upcoming', 'draft_id' => null, 'transaction_id' => null],
            ],
            'pending_expense_cents' => 21_000,
            'pending_income_cents' => 0,
            'posted_expense_cents' => 80_000,
            'posted_income_cents' => 210_000,
        ]]);
});

it('moves a variable item from pending to posted with its real amount once confirmed', function (): void {
    $draft = Draft::query()->sole();

    $this->postJson('/api/v1/transactions', [
        'type' => 'expense', 'amount_cents' => 7_345, 'date' => '2026-10-05', 'account_id' => $this->checking->id,
        'category_id' => $draft->category_id, 'draft_id' => $draft->id,
    ])->assertCreated();

    $this->getJson('/api/v1/recurring/forecast')
        ->assertOk()
        ->assertJsonPath('data.items.2.status', 'posted')
        ->assertJsonPath('data.items.2.amount_cents', 7_345)
        ->assertJsonPath('data.items.2.draft_id', null)
        ->assertJsonPath('data.pending_expense_cents', 15_000)
        ->assertJsonPath('data.posted_expense_cents', 87_345);
});

it('reports a deleted generated movement and a discarded draft as skipped', function (): void {
    $rentTransaction = Transaction::query()->where('date', '2026-10-01')->sole();
    $this->deleteJson("/api/v1/transactions/{$rentTransaction->id}")->assertNoContent();
    $this->postJson('/api/v1/drafts/'.Draft::query()->sole()->id.'/discard')->assertOk();

    $this->getJson('/api/v1/recurring/forecast')
        ->assertOk()
        ->assertJsonPath('data.items.1.status', 'skipped')
        ->assertJsonPath('data.items.1.transaction_id', null)
        ->assertJsonPath('data.items.2.status', 'skipped')
        ->assertJsonPath('data.items.2.draft_id', null)
        ->assertJsonPath('data.pending_expense_cents', 15_000)
        ->assertJsonPath('data.posted_expense_cents', 0);
});

it('forecasts another period by label', function (): void {
    $this->getJson('/api/v1/recurring/forecast?period=2026-11')
        ->assertOk()
        ->assertJsonPath('data.period.start', '2026-10-25')
        ->assertJsonPath('data.period.end', '2026-11-24')
        ->assertJsonPath('data.items.*.template_name', ['Nómina', 'Alquiler', 'Luz', 'Agua', 'Revista', 'Gimnasio'])
        ->assertJsonPath('data.items.*.status', ['upcoming', 'upcoming', 'upcoming', 'upcoming', 'skipped', 'upcoming'])
        ->assertJsonPath('data.pending_expense_cents', 80_000 + 6_000 + 4_500 + 3_000)
        ->assertJsonPath('data.pending_income_cents', 210_000)
        ->assertJsonPath('data.posted_expense_cents', 0);
});

it('keeps posted occurrences of deleted templates and drops their upcoming slots', function (): void {
    $this->deleteJson("/api/v1/recurring-templates/{$this->rent->id}")->assertNoContent();
    $this->deleteJson("/api/v1/recurring-templates/{$this->gym->id}")->assertNoContent();

    $this->getJson('/api/v1/recurring/forecast')
        ->assertOk()
        ->assertJsonPath('data.items.*.template_name', ['Nómina', 'Alquiler', 'Luz', 'Seguro', 'Revista'])
        ->assertJsonPath('data.posted_expense_cents', 80_000)
        ->assertJsonPath('data.pending_expense_cents', 18_000);
});

it('does not list an occurrence twice after day_of_month moved it across the period boundary', function (): void {
    $this->patchJson("/api/v1/recurring-templates/{$this->rent->id}", ['day_of_month' => 28])->assertOk();

    $current = collect($this->getJson('/api/v1/recurring/forecast')->json('data.items'))->where('template_name', 'Alquiler');
    $next = collect($this->getJson('/api/v1/recurring/forecast?period=2026-11')->json('data.items'))->where('template_name', 'Alquiler');

    expect($current->pluck('status')->all())->toBe(['posted'])
        ->and($current->pluck('due_date')->all())->toBe(['2026-10-01'])
        ->and($next->all())->toBe([]);
});

it('validates the period label', function (): void {
    $this->getJson('/api/v1/recurring/forecast?period=2026-13')
        ->assertUnprocessable()
        ->assertJsonValidationErrors('period');
});
