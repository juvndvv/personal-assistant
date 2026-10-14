<?php

declare(strict_types=1);

use App\Actions\Exports\ExportTransactionsCsv;
use App\Domain\Transactions\TransactionFilters;
use App\Enums\CsvDelimiter;
use App\Models\Tag;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\PerformanceSeeder;
use Illuminate\Support\Facades\DB;

const EXPORT_PEAK_MEMORY_BUDGET_BYTES = 64 * 1024 * 1024;

it('streams a 50k-row CSV export within the memory budget', function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());
    $this->seed(PerformanceSeeder::class);

    $tags = collect(['casa', 'viaje', 'trabajo'])->map(fn (string $name): Tag => Tag::query()->create(['name' => $name]));
    DB::statement('INSERT INTO tag_transaction (transaction_id, tag_id) SELECT id, ? FROM transactions WHERE type IN (?, ?) AND id % 3 = 0', [$tags[0]->id, 'expense', 'income']);
    DB::statement('INSERT INTO tag_transaction (transaction_id, tag_id) SELECT id, ? FROM transactions WHERE type IN (?, ?) AND id % 5 = 0', [$tags[1]->id, 'expense', 'income']);

    $rows = Transaction::query()->count();
    expect($rows)->toBeGreaterThanOrEqual(50_000);

    $output = tmpfile();
    gc_collect_cycles();
    $baseline = memory_get_usage();
    memory_reset_peak_usage();
    $started = hrtime(true);

    app(ExportTransactionsCsv::class)->handle(new TransactionFilters, CsvDelimiter::Semicolon, $output);

    $peak = memory_get_peak_usage() - $baseline;
    $elapsedMs = intdiv(hrtime(true) - $started, 1_000_000);

    rewind($output);
    $lines = 0;

    while (fgets($output) !== false) {
        $lines++;
    }

    fclose($output);

    fwrite(STDERR, sprintf("\nCSV export: %d rows, peak +%.1f MB, %d ms\n", $rows, $peak / 1_048_576, $elapsedMs));

    expect($lines)->toBe($rows + 1)
        ->and($peak)->toBeLessThan(EXPORT_PEAK_MEMORY_BUDGET_BYTES);
})->group('perf');
