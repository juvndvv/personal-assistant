<?php

declare(strict_types=1);

use App\Models\Account;
use App\Models\Category;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\DevSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Support\Captures;
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

it('passes with pending, confirmed and discarded capture drafts', function (): void {
    Storage::fake('receipts');
    $this->actingAs(User::factory()->create());
    Account::factory()->openedOn(day('2026-01-01'))->create();
    $category = Category::factory()->create();

    Captures::voiceDraft(Captures::extraction());
    $confirmed = Captures::voiceDraft(Captures::extraction());
    $this->postJson('/api/v1/transactions', [
        'type' => 'expense', 'amount_cents' => 2000, 'category_id' => $category->id, 'draft_id' => $confirmed->id,
    ])->assertCreated();
    $discarded = Captures::photoDraft(Captures::extraction());
    $this->postJson("/api/v1/drafts/{$discarded->id}/discard")->assertOk();

    $this->artisan('app:ledger:verify')
        ->expectsOutputToContain('Ledger OK')
        ->assertSuccessful();
});

it('fails on a capture file that belongs to neither a movement nor a pending draft', function (): void {
    $captureId = strtolower((string) Str::ulid());
    DB::table('captures')->insert(['id' => $captureId, 'kind' => 'photo', 'created_at' => now(), 'updated_at' => now()]);
    DB::table('drafts')->insert([
        'origin' => 'photo', 'status' => 'discarded', 'capture_id' => $captureId, 'discarded_at' => now(), 'created_at' => now(), 'updated_at' => now(),
    ]);
    DB::table('attachments')->insert([
        'id' => strtolower((string) Str::ulid()), 'capture_id' => $captureId, 'kind' => 'image', 'disk' => 'receipts',
        'path' => '2026/10/leftover.jpg', 'mime' => 'image/jpeg', 'size_bytes' => 10, 'sha256' => str_repeat('b', 64),
        'created_at' => now(), 'updated_at' => now(),
    ]);

    $this->artisan('app:ledger:verify')
        ->expectsOutputToContain("capture {$captureId} has no pending draft")
        ->assertFailed();
});

it('fails on a confirmed draft that lost its ledger row', function (): void {
    $captureId = strtolower((string) Str::ulid());
    DB::statement('ALTER TABLE drafts DROP CONSTRAINT drafts_transaction_fk');
    DB::table('captures')->insert(['id' => $captureId, 'kind' => 'voice', 'created_at' => now(), 'updated_at' => now()]);
    $draftId = DB::table('drafts')->insertGetId([
        'origin' => 'voice', 'status' => 'confirmed', 'capture_id' => $captureId, 'transaction_id' => 987_654,
        'confirmed_at' => now(), 'created_at' => now(), 'updated_at' => now(),
    ]);

    $this->artisan('app:ledger:verify')
        ->expectsOutputToContain("Confirmed draft {$draftId} does not point to a ledger row.")
        ->assertFailed();
});
