<?php

declare(strict_types=1);

use App\Actions\Transfers\RegisterTransfer;
use App\Enums\TransactionOrigin;
use App\Models\Account;
use App\Models\Category;
use App\Models\Setting;
use App\Models\Tag;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Support\Ledger;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());

    $this->bbva = Account::factory()->openedOn(day('2026-01-01'), 100_000)->create(['name' => 'BBVA']);
    $this->visa = Account::factory()->creditCard()->openedOn(day('2026-01-01'))->create(['name' => 'Visa']);
    $this->savings = Account::factory()->openedOn(day('2026-01-01'))->create(['name' => 'Ahorro']);

    $this->food = Category::factory()->create(['name' => 'Alimentación']);
    $this->supermarket = Category::factory()->childOf($this->food)->create(['name' => 'Supermercado']);
    $this->leisure = Category::factory()->create(['name' => 'Ocio']);
    $this->salary = Category::factory()->income()->create(['name' => 'Nómina']);

    $this->home = Tag::query()->create(['name' => 'casa']);
    $this->trip = Tag::query()->create(['name' => 'viaje']);

    $this->rows = [
        'cafe' => Ledger::expense($this->bbva, 250, '2026-09-28', $this->leisure, ['description' => 'Café con leche', 'origin' => TransactionOrigin::Voice]),
        'mercadona' => Ledger::expense($this->visa, 4_500, '2026-10-02', $this->supermarket, ['merchant' => 'MERCADONA S.A.']),
        'parent' => Ledger::expense($this->bbva, 1_000, '2026-10-05', $this->food, ['note' => 'Mercado de abastos', 'origin' => TransactionOrigin::Photo]),
        'salary' => Ledger::income($this->bbva, 210_000, '2026-10-01', $this->salary, ['description' => 'Nómina']),
        'cinema' => Ledger::expense($this->visa, 1_800, '2026-10-10', $this->leisure, ['description' => 'Cine 100%_off']),
    ];

    $this->rows['mercadona']->tags()->attach([$this->home->id, $this->trip->id]);
    $this->rows['parent']->tags()->attach([$this->home->id]);
    $this->rows['cinema']->tags()->attach([$this->trip->id]);

    $this->transfer = app(RegisterTransfer::class)->handle($this->bbva->id, $this->savings->id, 20_000, day('2026-10-03'), note: 'Hucha');
    $this->adjustment = Transaction::factory()->on($this->savings, day('2026-10-04'))->adjustment(5_000, 25_000)->create();
});

function listIds(TestResponse $response): array
{
    return array_map(fn (array $row): int => $row['id'], $response->assertOk()->json('data'));
}

function rowIds(string ...$names): array
{
    return array_map(fn (string $name): int => test()->rows[$name]->id, $names);
}

it('lists everything newest first, showing each transfer once without an account filter', function (): void {
    $outLeg = $this->transfer->legs->firstWhere('transfer_leg.value', 'out');

    $response = $this->getJson('/api/v1/transactions')->assertOk();

    expect(listIds($response))->toBe([
        $this->rows['cinema']->id,
        $this->rows['parent']->id,
        $this->adjustment->id,
        $outLeg->id,
        $this->rows['mercadona']->id,
        $this->rows['salary']->id,
        $this->rows['cafe']->id,
    ]);

    $response->assertJsonPath('data.3.transfer.counter_account.name', 'Ahorro')
        ->assertJsonPath('meta.total', 7)
        ->assertJsonPath('meta.per_page', 50)
        ->assertJsonPath('meta.totals', ['income_cents' => 210_000, 'expense_cents' => 250 + 4_500 + 1_000 + 1_800]);
});

it('returns the legs on the selected accounts when filtering by account', function (): void {
    $legs = $this->transfer->legs->keyBy(fn (Transaction $leg): string => $leg->transfer_leg?->value ?? '');

    expect(listIds($this->getJson("/api/v1/transactions?account_id[]={$this->savings->id}")))
        ->toBe([$this->adjustment->id, $legs['in']->id]);

    expect(listIds($this->getJson("/api/v1/transactions?account_id[]={$this->savings->id}&account_id[]={$this->bbva->id}&type[]=transfer")))
        ->toEqualCanonicalizing([$legs['in']->id, $legs['out']->id]);
});

it('filters each field on its own', function (string $query, array $expected): void {
    $replacements = [
        '{bbva}' => $this->bbva->id, '{visa}' => $this->visa->id, '{food}' => $this->food->id,
        '{supermarket}' => $this->supermarket->id, '{leisure}' => $this->leisure->id,
        '{home}' => $this->home->id, '{trip}' => $this->trip->id,
    ];

    $ids = listIds($this->getJson('/api/v1/transactions?'.strtr($query, $replacements)));

    expect($ids)->toEqualCanonicalizing(array_map(
        fn (string $name): int => match ($name) {
            'transfer' => $this->transfer->legs->firstWhere('transfer_leg.value', 'out')->id,
            'adjustment' => $this->adjustment->id,
            default => $this->rows[$name]->id,
        },
        $expected,
    ));
})->with([
    'q on description, accent-insensitive' => ['q=cafe', ['cafe']],
    'q uppercase and accented' => ['q='.rawurlencode('CAFÉ'), ['cafe']],
    'q with uppercase accented search term' => ['q='.rawurlencode('Mercadóna'), ['mercadona']],
    'q on merchant, case-insensitive' => ['q=mercadona', ['mercadona']],
    'q on note' => ['q=abastos', ['parent']],
    'q with like wildcards is literal' => ['q=100%25_', ['cinema']],
    'q percent alone matches only literal percent' => ['q=%25', ['cinema']],
    'q on transfer note' => ['q=hucha', ['transfer']],
    'single type' => ['type[]=income', ['salary']],
    'several types' => ['type[]=income&type[]=adjustment', ['salary', 'adjustment']],
    'transfer type' => ['type[]=transfer', ['transfer']],
    'account' => ['account_id[]={visa}', ['mercadona', 'cinema']],
    'category parent includes children' => ['category_id[]={food}', ['mercadona', 'parent']],
    'subcategory only' => ['category_id[]={supermarket}', ['mercadona']],
    'several categories' => ['category_id[]={supermarket}&category_id[]={leisure}', ['mercadona', 'cafe', 'cinema']],
    'tag any by default' => ['tag_id[]={home}&tag_id[]={trip}', ['mercadona', 'parent', 'cinema']],
    'tag any explicit' => ['tag_id[]={home}&tag_mode=any', ['mercadona', 'parent']],
    'tag all' => ['tag_id[]={home}&tag_id[]={trip}&tag_mode=all', ['mercadona']],
    'tag all with one tag' => ['tag_id[]={trip}&tag_mode=all', ['mercadona', 'cinema']],
    'origin' => ['origin[]=voice&origin[]=photo', ['cafe', 'parent']],
    'period with calendar months' => ['period=2026-09', ['cafe']],
    'date from' => ['date_from=2026-10-05', ['parent', 'cinema']],
    'date to' => ['date_to=2026-10-01', ['cafe', 'salary']],
    'date range' => ['date_from=2026-10-02&date_to=2026-10-04', ['mercadona', 'transfer', 'adjustment']],
    'amount min on magnitude' => ['amount_min_cents=4500', ['mercadona', 'salary', 'transfer', 'adjustment']],
    'amount max on magnitude' => ['amount_max_cents=1000', ['cafe', 'parent']],
    'amount range' => ['amount_min_cents=1000&amount_max_cents=4500', ['mercadona', 'parent', 'cinema']],
    'with receipts (none before attachments exist)' => ['has_attachments=1', []],
    'without receipts' => ['has_attachments=0&type[]=income', ['salary']],
]);

it('combines filters with AND across fields and OR within each', function (): void {
    $query = http_build_query([
        'q' => 'MERCA',
        'type' => ['expense', 'income'],
        'account_id' => [$this->visa->id, $this->bbva->id],
        'category_id' => [$this->food->id],
        'tag_id' => [$this->home->id],
        'origin' => ['manual', 'photo'],
        'date_from' => '2026-10-01',
        'date_to' => '2026-10-31',
        'amount_min_cents' => 500,
        'amount_max_cents' => 5_000,
    ]);

    expect(listIds($this->getJson("/api/v1/transactions?{$query}")))->toEqualCanonicalizing(rowIds('mercadona', 'parent'));

    $narrower = http_build_query(['q' => 'MERCA', 'origin' => ['photo'], 'account_id' => [$this->bbva->id]]);
    expect(listIds($this->getJson("/api/v1/transactions?{$narrower}")))->toBe(rowIds('parent'));

    $none = http_build_query(['q' => 'mercadona', 'account_id' => [$this->bbva->id]]);
    $this->getJson("/api/v1/transactions?{$none}")
        ->assertOk()
        ->assertJsonCount(0, 'data')
        ->assertJsonPath('meta.totals', ['income_cents' => 0, 'expense_cents' => 0]);
});

it('uses the configured month start day for the period filter and lets it override the date range', function (): void {
    Setting::current()->update(['month_start_day' => 25]);

    expect(listIds($this->getJson('/api/v1/transactions?period=2026-10&date_from=2026-10-09')))
        ->toEqualCanonicalizing([
            ...rowIds('cafe', 'mercadona', 'parent', 'salary', 'cinema'),
            $this->transfer->legs->firstWhere('transfer_leg.value', 'out')->id,
            $this->adjustment->id,
        ]);

    $this->getJson('/api/v1/transactions?period=2026-11')->assertOk()->assertJsonCount(0, 'data');
});

it('computes totals over the whole filtered set, not just the page', function (): void {
    $this->getJson('/api/v1/transactions?per_page=1&type[]=expense')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('meta.total', 4)
        ->assertJsonPath('meta.last_page', 4)
        ->assertJsonPath('meta.totals', ['income_cents' => 0, 'expense_cents' => 7_550]);
});

it('paginates by page', function (): void {
    $first = listIds($this->getJson('/api/v1/transactions?per_page=3'));
    $second = $this->getJson('/api/v1/transactions?per_page=3&page=2')->assertOk();

    expect(array_intersect($first, listIds($second)))->toBe([])
        ->and($second->json('meta.current_page'))->toBe(2)
        ->and($second->json('links.next'))->toContain('per_page=3');
});

it('sorts by date or amount magnitude', function (string $sort, array $expected): void {
    $ids = listIds($this->getJson("/api/v1/transactions?type[]=expense&sort={$sort}"));

    expect($ids)->toBe(rowIds(...$expected));
})->with([
    'newest first' => ['-date', ['cinema', 'parent', 'mercadona', 'cafe']],
    'oldest first' => ['date', ['cafe', 'mercadona', 'parent', 'cinema']],
    'largest first' => ['-amount', ['mercadona', 'cinema', 'parent', 'cafe']],
    'smallest first' => ['amount', ['cafe', 'parent', 'cinema', 'mercadona']],
]);

it('breaks date ties by newest id', function (): void {
    $later = Ledger::expense($this->bbva, 10, '2026-10-10', $this->leisure);

    expect(array_slice(listIds($this->getJson('/api/v1/transactions')), 0, 2))->toBe([$later->id, $this->rows['cinema']->id]);
});

it('hides deleted movements', function (): void {
    $this->rows['cinema']->delete();

    expect(listIds($this->getJson('/api/v1/transactions?type[]=expense')))->not->toContain($this->rows['cinema']->id);
});

it('validates the list query', function (string $query, string $field): void {
    $this->getJson("/api/v1/transactions?{$query}")->assertUnprocessable()->assertJsonValidationErrors([$field]);
})->with([
    ['type[]=loan', 'type.0'],
    ['type=expense', 'type'],
    ['account_id[]=abc', 'account_id.0'],
    ['tag_mode=some', 'tag_mode'],
    ['origin[]=email', 'origin.0'],
    ['period=2026-13', 'period'],
    ['date_from=2026/10/01', 'date_from'],
    ['date_from=2026-10-05&date_to=2026-10-01', 'date_to'],
    ['amount_min_cents=-1', 'amount_min_cents'],
    ['amount_min_cents=500&amount_max_cents=100', 'amount_max_cents'],
    ['has_attachments=maybe', 'has_attachments'],
    ['sort=name', 'sort'],
    ['per_page=101', 'per_page'],
    ['per_page=0', 'per_page'],
    ['page=0', 'page'],
    ['q='.str_repeat('a', 101), 'q'],
    ['q=%C3%28', 'q'],
]);

it('keeps the query count independent of the page size', function (): void {
    foreach (range(1, 30) as $index) {
        $row = Ledger::expense($this->bbva, 100 + $index, '2026-10-0'.(($index % 9) + 1), $this->supermarket);
        $row->tags()->attach($this->home->id);
    }

    app(RegisterTransfer::class)->handle($this->bbva->id, $this->savings->id, 1_000, day('2026-10-12'));

    $countQueries = function (int $perPage): int {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson("/api/v1/transactions?per_page={$perPage}")->assertOk()->assertJsonCount($perPage, 'data');
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    };

    expect($countQueries(5))->toBe($countQueries(35));
});
