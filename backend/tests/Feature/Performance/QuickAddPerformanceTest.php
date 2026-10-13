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

it('records a quick-add expense within the latency budget and a bounded query count on 10k rows', function (): void {
    $payload = fn (): array => [
        'type' => 'expense',
        'amount_cents' => 1_250,
        'category_id' => $this->categories[0]->id,
        'tags' => ['casa', 'nuevo'],
    ];

    $this->postJson('/api/v1/transactions', $payload())->assertCreated();

    DB::flushQueryLog();
    DB::enableQueryLog();
    $started = hrtime(true);

    $this->postJson('/api/v1/transactions', $payload())->assertCreated();

    $elapsedMs = intdiv(hrtime(true) - $started, 1_000_000);
    $queries = count(DB::getQueryLog());
    DB::disableQueryLog();

    expect($elapsedMs)->toBeLessThan(POST_TRANSACTION_BUDGET_MS)
        ->and($queries)->toBeLessThanOrEqual(POST_TRANSACTION_MAX_QUERIES);
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

    $started = hrtime(true);
    $response = $this->getJson('/api/v1/transactions?q=cafe&per_page=100&period=2026-10')->assertOk();
    $elapsedMs = intdiv(hrtime(true) - $started, 1_000_000);

    expect($response->json('meta.total'))->toBeGreaterThan(0)
        ->and($elapsedMs)->toBeLessThan(POST_TRANSACTION_BUDGET_MS * 2);
});
