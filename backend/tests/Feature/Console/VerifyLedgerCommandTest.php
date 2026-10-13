<?php

declare(strict_types=1);

use Carbon\CarbonImmutable;
use Database\Seeders\DevSeeder;
use Tests\Support\RawLedger;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
});

it('passes on an empty ledger', function (): void {
    $this->artisan('app:ledger:verify')
        ->expectsOutputToContain('Ledger OK')
        ->assertSuccessful();
});

it('passes on the dev seed', function (): void {
    $this->seed(DevSeeder::class);

    $this->artisan('app:ledger:verify')
        ->expectsOutputToContain('Ledger OK')
        ->assertSuccessful();
});

it('fails on an unbalanced transfer', function (): void {
    $from = RawLedger::account();
    $to = RawLedger::account();

    RawLedger::withoutTriggers(function () use ($from, $to): void {
        $transferId = RawLedger::transfer($from, $to, ['amount_cents' => 5000]);
        RawLedger::leg($transferId, 'out', $from, -5000);
        RawLedger::leg($transferId, 'in', $to, 4000);
    });

    $this->artisan('app:ledger:verify')
        ->expectsOutputToContain('has 2 live legs, 1 balanced')
        ->assertFailed();
});

it('fails on a soft-deleted transfer with live legs', function (): void {
    $from = RawLedger::account();
    $to = RawLedger::account();

    RawLedger::withoutTriggers(function () use ($from, $to): void {
        $transferId = RawLedger::transfer($from, $to, ['deleted_at' => now()]);
        RawLedger::leg($transferId, 'out', $from, -5000);
    });

    $this->artisan('app:ledger:verify')
        ->expectsOutputToContain('(deleted) has 1 live legs')
        ->assertFailed();
});

it('fails on a movement whose category has the other kind', function (): void {
    $account = RawLedger::account();
    $incomeCategory = RawLedger::category(['kind' => 'income']);

    RawLedger::withoutTriggers(fn () => RawLedger::transaction([
        'account_id' => $account,
        'category_id' => $incomeCategory,
    ]));

    $this->artisan('app:ledger:verify')
        ->expectsOutputToContain('has category '.$incomeCategory.' of kind income')
        ->assertFailed();
});

it('fails on a movement dated before the opening date', function (): void {
    $account = RawLedger::account(['opening_date' => '2026-05-01']);
    $category = RawLedger::category();

    RawLedger::withoutTriggers(fn () => RawLedger::transaction([
        'account_id' => $account,
        'category_id' => $category,
        'date' => '2026-04-30',
    ]));

    $this->artisan('app:ledger:verify')
        ->expectsOutputToContain('precedes the opening date 2026-05-01')
        ->expectsOutputToContain('1 ledger invariant violation(s) found.')
        ->assertFailed();
});

it('ignores soft-deleted movements dated before the opening date', function (): void {
    $account = RawLedger::account(['opening_date' => '2026-05-01']);

    RawLedger::withoutTriggers(fn () => RawLedger::transaction([
        'account_id' => $account,
        'category_id' => RawLedger::category(),
        'date' => '2026-04-30',
        'deleted_at' => now(),
    ]));

    $this->artisan('app:ledger:verify')->assertSuccessful();
});
