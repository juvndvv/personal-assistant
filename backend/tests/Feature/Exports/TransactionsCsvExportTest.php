<?php

declare(strict_types=1);

use App\Actions\Exports\ExportTransactionsCsv;
use App\Domain\Period\PeriodResolver;
use App\Models\Account;
use App\Models\Category;
use App\Models\RecurringTemplate;
use App\Models\Tag;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Support\Captures;
use Tests\Support\Csv;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    Storage::fake('receipts');
    $this->actingAs(User::factory()->create());

    $this->checking = Account::factory()->openedOn(day('2026-01-01'), 100_000)->create(['name' => 'BBVA']);
    $this->visa = Account::factory()->creditCard(statementDay: 5)->openedOn(day('2026-01-01'))->create(['name' => 'Visa; Oro']);
    $this->food = Category::factory()->create(['name' => 'Alimentación']);
    $this->groceries = Category::factory()->childOf($this->food)->create(['name' => 'Supermercado']);
    $this->salary = Category::factory()->income()->create(['name' => 'Nómina']);
});

function exportCsv(array $query = []): TestResponse
{
    return test()->get('/api/v1/exports/transactions.csv'.($query === [] ? '' : '?'.http_build_query($query)));
}

/**
 * @return array<int, array<string, string>>
 */
function exportedRowsById(array $query = [], string $delimiter = ';'): array
{
    $rows = Csv::rows(exportCsv($query)->assertOk()->streamedContent(), $delimiter);

    return array_combine(array_map(fn (array $row): int => (int) $row['id'], $rows), $rows);
}

function seedExportLedger(): array
{
    $expenseId = test()->postJson('/api/v1/transactions', [
        'type' => 'expense', 'amount_cents' => 2_350, 'date' => '2026-10-12', 'account_id' => test()->checking->id,
        'category_id' => test()->groceries->id, 'description' => '=HYPERLINK("http://evil")', 'merchant' => 'Mercadona',
        'note' => "Línea; con \"comillas\"\r\ny salto", 'tags' => ['viaje roma', 'casa'],
    ])->assertCreated()->json('data.id');

    $incomeId = test()->postJson('/api/v1/transactions', [
        'type' => 'income', 'amount_cents' => 210_000, 'date' => '2026-10-01', 'account_id' => test()->checking->id,
        'category_id' => test()->salary->id, 'description' => 'Nómina octubre',
    ])->assertCreated()->json('data.id');

    $transferId = test()->postJson('/api/v1/transfers', [
        'kind' => 'card_settlement', 'from_account_id' => test()->checking->id, 'to_account_id' => test()->visa->id,
        'amount_cents' => 45_230, 'date' => '2026-10-05', 'note' => '+pago tarjeta',
    ])->assertCreated()->json('data.id');

    $adjustmentId = test()->postJson('/api/v1/accounts/'.test()->checking->id.'/adjustments', [
        'target_balance_cents' => 50_000, 'date' => '2026-10-13', 'note' => '@cuadre',
    ])->assertCreated()->json('data.id');

    test()->post("/api/v1/transactions/{$expenseId}/attachments", ['file' => Captures::photo()])->assertCreated();

    RecurringTemplate::factory()->create([
        'name' => 'Gimnasio', 'account_id' => test()->checking->id, 'category_id' => test()->food->id,
        'day_of_month' => 3, 'starts_on' => day('2026-10-01'), 'amount_cents' => 3_000,
    ]);
    test()->artisan('app:recurring:generate')->assertSuccessful();

    $deletedId = test()->postJson('/api/v1/transactions', [
        'type' => 'expense', 'amount_cents' => 999, 'date' => '2026-10-02', 'account_id' => test()->checking->id,
        'category_id' => test()->groceries->id, 'description' => 'Borrado',
    ])->assertCreated()->json('data.id');
    test()->deleteJson("/api/v1/transactions/{$deletedId}")->assertNoContent();

    return [
        'expense' => (int) $expenseId,
        'income' => (int) $incomeId,
        'transfer' => (int) $transferId,
        'adjustment' => (int) $adjustmentId,
        'recurring' => (int) Transaction::query()->where('origin', 'recurring')->value('id'),
        'deleted' => (int) $deletedId,
    ];
}

it('streams a Spanish-Excel friendly CSV with the contract columns', function (): void {
    $ids = seedExportLedger();

    $response = exportCsv()->assertOk();
    $content = $response->streamedContent();

    expect($response->headers->get('Content-Type'))->toBe('text/csv; charset=UTF-8')
        ->and($response->headers->get('Content-Disposition'))->toMatch('/^attachment; filename=movimientos-2026-10-13-\d{6}\.csv$/')
        ->and($content)->toStartWith(Csv::BOM.'id;date;type;account;account_type;category;parent_category;amount_cents;amount_eur;description;merchant;note;tags;origin;transfer_id;transfer_kind;transfer_leg;counter_account;adjustment_target_cents;recurring_template;attachments_count;created_at'."\r\n")
        ->and(Csv::header($content))->toBe(ExportTransactionsCsv::COLUMNS);

    $rows = exportedRowsById();
    $expense = Transaction::query()->findOrFail($ids['expense']);

    expect($rows[$ids['expense']])->toBe([
        'id' => (string) $ids['expense'],
        'date' => '2026-10-12',
        'type' => 'expense',
        'account' => 'BBVA',
        'account_type' => 'checking',
        'category' => 'Supermercado',
        'parent_category' => 'Alimentación',
        'amount_cents' => '-2350',
        'amount_eur' => '-23,50',
        'description' => '\'=HYPERLINK("http://evil")',
        'merchant' => 'Mercadona',
        'note' => "Línea; con \"comillas\"\r\ny salto",
        'tags' => 'casa|viaje roma',
        'origin' => 'manual',
        'transfer_id' => '',
        'transfer_kind' => '',
        'transfer_leg' => '',
        'counter_account' => '',
        'adjustment_target_cents' => '',
        'recurring_template' => '',
        'attachments_count' => '1',
        'created_at' => (string) $expense->created_at?->toIso8601String(),
    ]);

    expect($rows[$ids['income']])->toMatchArray(['amount_cents' => '210000', 'amount_eur' => '2100,00', 'category' => 'Nómina', 'parent_category' => '', 'tags' => ''])
        ->and($rows[$ids['adjustment']])->toMatchArray(['type' => 'adjustment', 'adjustment_target_cents' => '50000', 'note' => "'@cuadre"])
        ->and($rows[$ids['recurring']])->toMatchArray(['origin' => 'recurring', 'recurring_template' => 'Gimnasio', 'category' => 'Alimentación', 'amount_cents' => '-3000'])
        ->and($rows)->not->toHaveKey($ids['deleted']);
});

it('exports both legs of every transfer with its counter account', function (): void {
    $ids = seedExportLedger();
    $legs = array_values(array_filter(exportedRowsById(), fn (array $row): bool => $row['transfer_id'] === (string) $ids['transfer']));

    expect($legs)->toHaveCount(2)
        ->and($legs[0])->toMatchArray([
            'type' => 'transfer', 'account' => 'BBVA', 'amount_cents' => '-45230', 'amount_eur' => '-452,30',
            'transfer_kind' => 'card_settlement', 'transfer_leg' => 'out', 'counter_account' => 'Visa; Oro', 'note' => "'+pago tarjeta",
        ])
        ->and($legs[1])->toMatchArray([
            'account' => 'Visa; Oro', 'account_type' => 'credit_card', 'amount_cents' => '45230', 'transfer_leg' => 'in', 'counter_account' => 'BBVA',
        ]);
});

it('uses commas and dot decimals with the comma delimiter', function (): void {
    $ids = seedExportLedger();

    $content = exportCsv(['delimiter' => 'comma'])->assertOk()->streamedContent();
    $rows = Csv::rows($content, ',');
    $byId = array_combine(array_map(fn (array $row): int => (int) $row['id'], $rows), $rows);

    expect($content)->toStartWith(Csv::BOM.'id,date,type,account,')
        ->and($byId[$ids['expense']])->toMatchArray(['amount_cents' => '-2350', 'amount_eur' => '-23.50', 'note' => "Línea; con \"comillas\"\r\ny salto"])
        ->and(array_column($rows, 'account'))->toContain('Visa; Oro');
});

it('exports exactly the rows of the filtered list, plus the in legs the list collapses', function (array $query): void {
    seedExportLedger();
    Tag::query()->firstOrCreate(['name' => 'otra']);

    $listed = collect(test()->getJson('/api/v1/transactions?'.http_build_query([...$query, 'per_page' => 100]))->assertOk()->json('data'));
    $exported = exportedRowsById($query);

    $extra = array_diff(array_keys($exported), $listed->pluck('id')->all());

    expect($listed)->not->toBeEmpty()
        ->and(array_diff($listed->pluck('id')->all(), array_keys($exported)))->toBe([])
        ->and(collect($extra)->every(fn (int $id): bool => $exported[$id]['transfer_leg'] === 'in'))->toBeTrue()
        ->and(collect($extra)->every(fn (int $id): bool => $listed->pluck('transfer.id')->filter()->contains((int) $exported[$id]['transfer_id'])))->toBeTrue();
})->with([
    'no filters' => [[]],
    'expenses' => [['type' => ['expense']]],
    'card account' => [fn (): array => ['account_id' => [test()->visa->id]]],
    'search' => [['q' => 'mercadona']],
    'period' => [['period' => '2026-10']],
    'date range and amounts' => [['date_from' => '2026-10-02', 'date_to' => '2026-10-12', 'amount_min_cents' => 2_000]],
    'with receipts' => [['has_attachments' => 1]],
    'origin' => [['origin' => ['recurring']]],
]);

it('filters by tags and categories like the list', function (): void {
    $ids = seedExportLedger();
    $tag = Tag::query()->where('name', 'casa')->sole();

    expect(array_keys(exportedRowsById(['tag_id' => [$tag->id]])))->toBe([$ids['expense']])
        ->and(array_keys(exportedRowsById(['category_id' => [$this->food->id]])))->toBe([$ids['expense'], $ids['recurring']]);
});

it('round-trips signed cents so per-period sums equal the summary report', function (): void {
    DB::table('settings')->update(['month_start_day' => 25]);
    $dates = ['2026-07-24', '2026-07-25', '2026-08-24', '2026-08-25', '2026-09-30', '2026-10-13'];

    foreach ($dates as $index => $date) {
        $this->postJson('/api/v1/transactions', [
            'type' => 'expense', 'amount_cents' => 1_001 + $index * 337, 'date' => $date, 'category_id' => $this->groceries->id, 'account_id' => $this->checking->id,
        ])->assertCreated();
        $this->postJson('/api/v1/transactions', [
            'type' => 'income', 'amount_cents' => 99_999 + $index, 'date' => $date, 'category_id' => $this->salary->id, 'account_id' => $this->visa->id,
        ])->assertCreated();
    }

    $this->postJson('/api/v1/transfers', ['from_account_id' => $this->checking->id, 'to_account_id' => $this->visa->id, 'amount_cents' => 777, 'date' => '2026-08-25'])->assertCreated();

    $periods = app(PeriodResolver::class);
    $sums = [];

    foreach (Csv::rows(exportCsv()->assertOk()->streamedContent()) as $row) {
        expect(Csv::centsFromEuros($row['amount_eur'], ','))->toBe((int) $row['amount_cents']);

        if (in_array($row['type'], ['expense', 'income'], true)) {
            $label = $periods->forDate(day($row['date']))->label;
            $sums[$label][$row['type']] = ($sums[$label][$row['type']] ?? 0) + (int) $row['amount_cents'];
        }
    }

    expect(array_keys($sums))->toEqualCanonicalizing(['2026-07', '2026-08', '2026-09', '2026-10']);

    foreach ($sums as $label => $totals) {
        $this->getJson("/api/v1/reports/summary?period={$label}")
            ->assertOk()
            ->assertJsonPath('data.income_cents', $totals['income'])
            ->assertJsonPath('data.expense_cents', -$totals['expense']);
    }
});

it('validates the delimiter and the list filters', function (array $query, string $field): void {
    $this->getJson('/api/v1/exports/transactions.csv?'.http_build_query($query))
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);
})->with([
    'delimiter' => [['delimiter' => 'tab'], 'delimiter'],
    'period' => [['period' => '2026-13'], 'period'],
    'type' => [['type' => ['loan']], 'type.0'],
]);

it('rate limits exports to six per minute per user', function (): void {
    foreach (range(1, 6) as $attempt) {
        exportCsv()->assertOk();
    }

    exportCsv()->assertTooManyRequests();
    $this->getJson('/api/v1/exports/full.zip')->assertTooManyRequests();

    $this->travel(61)->seconds();
    exportCsv()->assertOk();
});

it('requires authentication', function (): void {
    auth()->logout();
    $this->app['auth']->forgetGuards();

    $this->getJson('/api/v1/exports/transactions.csv')->assertUnauthorized();
    $this->getJson('/api/v1/exports/full.zip')->assertUnauthorized();
});
