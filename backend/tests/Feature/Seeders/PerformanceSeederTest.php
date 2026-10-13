<?php

declare(strict_types=1);

use App\Enums\TransactionType;
use App\Enums\TransferKind;
use App\Models\Account;
use App\Models\Category;
use App\Models\Transaction;
use App\Models\Transfer;
use Carbon\CarbonImmutable;
use Database\Seeders\PerformanceSeeder;
use Illuminate\Support\Facades\DB;

function seedPerformanceLedger(int $movements): void
{
    $seeder = app(PerformanceSeeder::class);
    $seeder->movements = $movements;
    $seeder->run();
}

it('seeds a consistent ledger over three years with transfers, adjustments and forty categories', function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));

    seedPerformanceLedger(2_000);
    seedPerformanceLedger(2_000);

    $dates = DB::table('transactions')->selectRaw('MIN(date) AS first, MAX(date) AS last')->first();

    expect(Transaction::query()->count())->toBe(2_000)
        ->and(Category::query()->where('name', 'like', 'Perf %')->count())->toBe(40)
        ->and(Transfer::query()->where('kind', TransferKind::Transfer)->exists())->toBeTrue()
        ->and(Transfer::query()->where('kind', TransferKind::CardSettlement)->exists())->toBeTrue()
        ->and(Transaction::query()->where('type', TransactionType::Adjustment)->count())->toBe(10)
        ->and(Transaction::query()->reportable()->count())->toBe(2_000 - 80 - 10)
        ->and(Account::query()->whereNotNull('archived_at')->count())->toBe(1)
        ->and(DB::table('drafts')->where('status', 'confirmed')->count())->toBeGreaterThan(0)
        ->and($dates?->first)->toBe('2023-10-01')
        ->and($dates?->last)->toBe('2026-10-13');

    $this->artisan('app:ledger:verify')->assertSuccessful();
});

it('refuses to run in production', function (): void {
    app()->detectEnvironment(fn (): string => 'production');

    seedPerformanceLedger(10);
})->throws(RuntimeException::class);
