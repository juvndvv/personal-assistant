<?php

declare(strict_types=1);

use App\Models\Category;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\PerformanceSeeder;
use Illuminate\Support\Facades\DB;

const REPORT_P95_BUDGET_MS = 300;

const REPORT_SAMPLES = 40;

/**
 * @return list<int>
 */
function reportLatenciesMs(Closure $request): array
{
    $request();
    $latencies = [];

    for ($sample = 0; $sample < REPORT_SAMPLES; $sample++) {
        $started = hrtime(true);
        $request();
        $latencies[] = intdiv(hrtime(true) - $started, 1_000);
    }

    sort($latencies);

    return $latencies;
}

/**
 * @param  list<int>  $sortedMicroseconds
 */
function percentileMs(array $sortedMicroseconds, int $percentile): int
{
    $index = (int) ceil($percentile / 100 * count($sortedMicroseconds)) - 1;

    return intdiv($sortedMicroseconds[max($index, 0)], 1_000);
}

it('serves every report endpoint within the p95 budget on 50k movements', function (int $monthStartDay): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());
    $this->seed(PerformanceSeeder::class);
    DB::table('settings')->update(['month_start_day' => $monthStartDay]);

    $parent = Category::query()->where('name', 'Perf Gasto 1')->sole();

    expect(DB::table('transactions')->whereNull('deleted_at')->count())->toBe(50_000);

    $endpoints = [
        'summary' => '/api/v1/reports/summary?period=2026-09',
        'trend' => '/api/v1/reports/trend?periods=12',
        'trend by category' => "/api/v1/reports/trend?periods=24&category_id={$parent->id}",
        'net worth' => '/api/v1/reports/net-worth',
        'capture metrics' => '/api/v1/reports/capture-metrics?period=2026-09',
    ];

    $results = [];

    foreach ($endpoints as $name => $uri) {
        $latencies = reportLatenciesMs(fn () => $this->getJson($uri)->assertOk());
        $results[$name] = ['p50' => percentileMs($latencies, 50), 'p95' => percentileMs($latencies, 95)];
    }

    fwrite(STDOUT, PHP_EOL.'month_start_day='.$monthStartDay.' '.json_encode($results).PHP_EOL);

    foreach ($results as $name => $result) {
        expect($result['p95'])->toBeLessThan(REPORT_P95_BUDGET_MS, "{$name} p95 {$result['p95']} ms");
    }
})->with([1, 25])->group('perf');
