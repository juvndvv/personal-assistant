<?php

declare(strict_types=1);

use App\Models\Account;
use App\Models\Category;
use App\Models\Tag;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

const PERFORMANCE_SEEDED_ROWS = 10_000;

const POST_TRANSACTION_BUDGET_MS = 300;

const POST_TRANSACTION_MAX_QUERIES = 15;

const POST_TRANSACTION_SAMPLES = 30;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());

    $this->accounts = Account::factory()->count(4)->openedOn(day('2025-01-01'))->create();
    $this->categories = Category::factory()->count(20)->create();
    $tags = collect(['casa', 'viaje', 'trabajo'])->map(fn (string $name): Tag => Tag::query()->create(['name' => $name]));

    $now = CarbonImmutable::now();
    $start = day('2025-10-14');
    mt_srand(10_000);

    foreach (array_chunk(range(1, PERFORMANCE_SEEDED_ROWS), 1_000) as $chunk) {
        DB::table('transactions')->insert(array_map(fn (int $index): array => [
            'type' => 'expense',
            'account_id' => $this->accounts[$index % 4]->id,
            'amount_cents' => -mt_rand(100, 50_000),
            'date' => $start->addDays($index % 365)->toDateString(),
            'category_id' => $this->categories[$index % 20]->id,
            'description' => "Compra {$index}",
            'merchant' => $index % 3 === 0 ? 'Mercadona' : 'Café Central',
            'origin' => 'manual',
            'created_at' => $now,
            'updated_at' => $now,
        ], $chunk));
    }

    $firstId = (int) DB::table('transactions')->min('id');
    DB::table('tag_transaction')->insert(array_map(
        fn (int $offset): array => ['transaction_id' => $firstId + $offset, 'tag_id' => $tags[$offset % 3]->id],
        range(0, 2_999),
    ));

    DB::statement('ANALYZE transactions');
});

function quickAddPayload(): array
{
    return [
        'type' => 'expense',
        'amount_cents' => 1_250,
        'category_id' => test()->categories[0]->id,
        'tags' => ['casa', 'nuevo'],
    ];
}

function elapsedMs(Closure $callback): int
{
    $started = hrtime(true);
    $callback();

    return intdiv(hrtime(true) - $started, 1_000_000);
}

it('records a quick-add expense with a bounded query count on 10k rows', function (): void {
    $this->postJson('/api/v1/transactions', quickAddPayload())->assertCreated();

    DB::flushQueryLog();
    DB::enableQueryLog();
    $this->postJson('/api/v1/transactions', quickAddPayload())->assertCreated();
    $queries = count(DB::getQueryLog());
    DB::disableQueryLog();

    expect($queries)->toBeLessThanOrEqual(POST_TRANSACTION_MAX_QUERIES);
});

it('lists, searches and filters 10k rows with a query count independent of the page size', function (): void {
    $queriesFor = function (string $query): int {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson("/api/v1/transactions?{$query}")->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    };

    expect($queriesFor('per_page=10'))->toBe($queriesFor('per_page=100'))
        ->and($queriesFor('per_page=10&q=cafe'))->toBe($queriesFor('per_page=100&q=cafe'));

    $this->getJson('/api/v1/transactions?q=cafe&per_page=100&period=2026-10')
        ->assertOk()
        ->assertJsonPath('meta.total', fn (int $total): bool => $total > 0);
});

/**
 * @param  list<int>  $sortedMicroseconds
 */
function quickAddPercentileMs(array $sortedMicroseconds, int $percentile): int
{
    $index = (int) ceil($percentile / 100 * count($sortedMicroseconds)) - 1;

    return intdiv($sortedMicroseconds[max($index, 0)], 1_000);
}

it('records quick-add expenses within the p95 latency budget on 10k rows', function (): void {
    $this->postJson('/api/v1/transactions', quickAddPayload())->assertCreated();

    $latencies = [];

    for ($sample = 0; $sample < POST_TRANSACTION_SAMPLES; $sample++) {
        $started = hrtime(true);
        $this->postJson('/api/v1/transactions', quickAddPayload())->assertCreated();
        $latencies[] = intdiv(hrtime(true) - $started, 1_000);
    }

    sort($latencies);
    $p95 = quickAddPercentileMs($latencies, 95);

    fwrite(STDOUT, PHP_EOL.'scope=save '.json_encode([
        'save (POST /transactions)' => ['p50' => quickAddPercentileMs($latencies, 50), 'p95' => $p95],
    ]).PHP_EOL);

    expect($p95)->toBeLessThan(POST_TRANSACTION_BUDGET_MS);
})->group('perf');

it('searches 10k rows within the latency budget', function (): void {
    $this->getJson('/api/v1/transactions?per_page=10')->assertOk();

    $elapsed = elapsedMs(fn () => $this->getJson('/api/v1/transactions?q=cafe&per_page=100&period=2026-10')->assertOk());

    expect($elapsed)->toBeLessThan(POST_TRANSACTION_BUDGET_MS * 2);
})->group('perf');
