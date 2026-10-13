<?php

declare(strict_types=1);

use App\Enums\DraftStatus;
use App\Models\Account;
use App\Models\Attachment;
use App\Models\Capture;
use App\Models\Category;
use App\Models\Draft;
use App\Models\Setting;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Storage;
use Tests\Support\Captures;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-01 10:00', 'Europe/Madrid'));
    Storage::fake('receipts');
    $this->actingAs(User::factory()->create());

    $this->checking = Account::factory()->openedOn(day('2026-01-01'))->create(['name' => 'BBVA']);
    $this->groceries = Category::factory()->create(['name' => 'Supermercado']);
});

it('discards orphan capture drafts older than the TTL and deletes their files, but never receipts', function (): void {
    $orphan = Captures::voiceDraft(Captures::extraction());
    $orphanFile = Attachment::query()->where('capture_id', $orphan->capture_id)->sole();

    $confirmed = Captures::photoDraft(Captures::extraction(['category_id' => $this->groceries->id]));
    $this->postJson('/api/v1/transactions', [
        'type' => 'expense', 'amount_cents' => 2000, 'category_id' => $this->groceries->id, 'draft_id' => $confirmed->id,
    ])->assertCreated();
    $receipt = Attachment::query()->where('capture_id', $confirmed->capture_id)->sole();

    $this->travelTo(CarbonImmutable::parse('2026-10-07 10:00', 'Europe/Madrid'));
    $recent = Captures::voiceDraft(Captures::extraction());

    $this->travelTo(CarbonImmutable::parse('2026-10-08 10:01', 'Europe/Madrid'));

    $this->artisan('app:drafts:purge')
        ->expectsOutputToContain('Purged 1 orphan capture(s).')
        ->assertSuccessful();

    expect($orphan->refresh()->status)->toBe(DraftStatus::Discarded)
        ->and($recent->refresh()->status)->toBe(DraftStatus::Pending)
        ->and($confirmed->refresh()->status)->toBe(DraftStatus::Confirmed)
        ->and(Attachment::query()->whereKey($orphanFile->id)->exists())->toBeFalse()
        ->and(Attachment::query()->whereKey($receipt->id)->exists())->toBeTrue();

    Storage::disk('receipts')->assertMissing($orphanFile->path);
    Storage::disk('receipts')->assertExists($receipt->path);

    $this->travelTo(CarbonImmutable::parse('2027-06-01 10:00', 'Europe/Madrid'));
    $this->artisan('app:drafts:purge')->assertSuccessful();

    Storage::disk('receipts')->assertExists($receipt->path);
    expect($recent->refresh()->status)->toBe(DraftStatus::Discarded);
});

it('honours the configured orphan TTL', function (): void {
    Setting::query()->whereKey(Setting::SINGLETON_ID)->update(['orphan_draft_ttl_days' => 30]);
    $draft = Captures::voiceDraft(Captures::extraction());

    $this->travel(29)->days();
    $this->artisan('app:drafts:purge')->assertSuccessful();
    expect($draft->refresh()->status)->toBe(DraftStatus::Pending);

    $this->travel(2)->days();
    $this->artisan('app:drafts:purge')->assertSuccessful();
    expect($draft->refresh()->status)->toBe(DraftStatus::Discarded);
});

it('cleans up captures that never got a draft', function (): void {
    Captures::voiceDraft(Captures::extraction());
    $capture = Capture::query()->sole();
    $attachment = Attachment::query()->sole();
    Draft::query()->delete();

    $this->travel(8)->days();
    $this->artisan('app:drafts:purge')->assertSuccessful();

    expect(Capture::query()->count())->toBe(0)
        ->and(Attachment::query()->count())->toBe(0);
    Storage::disk('receipts')->assertMissing($attachment->path);
    expect($capture->exists)->toBeTrue();
});

it('leaves in-flight captures without a draft and those inside the TTL untouched', function (): void {
    $captureWithoutDraft = function (): array {
        $draft = Captures::voiceDraft(Captures::extraction());
        $attachment = Attachment::query()->where('capture_id', $draft->capture_id)->sole();
        $draft->delete();

        return [Capture::query()->findOrFail($draft->capture_id), $attachment];
    };

    [$expiredCapture, $expiredFile] = $captureWithoutDraft();

    $this->travelTo(CarbonImmutable::parse('2026-10-01 10:02', 'Europe/Madrid'));
    [$insideTtlCapture, $insideTtlFile] = $captureWithoutDraft();

    $this->travelTo(CarbonImmutable::parse('2026-10-08 09:58', 'Europe/Madrid'));
    [$inFlightCapture, $inFlightFile] = $captureWithoutDraft();

    $this->travelTo(CarbonImmutable::parse('2026-10-08 10:01', 'Europe/Madrid'));
    $this->artisan('app:drafts:purge')->assertSuccessful();

    expect(Capture::query()->whereKey($expiredCapture->id)->exists())->toBeFalse()
        ->and(Attachment::query()->whereKey($expiredFile->id)->exists())->toBeFalse();
    Storage::disk('receipts')->assertMissing($expiredFile->path);

    foreach ([[$insideTtlCapture, $insideTtlFile], [$inFlightCapture, $inFlightFile]] as [$capture, $attachment]) {
        expect(Capture::query()->whereKey($capture->id)->exists())->toBeTrue()
            ->and(Attachment::query()->whereKey($attachment->id)->exists())->toBeTrue();
        Storage::disk('receipts')->assertExists($attachment->path);
    }
});

it('is scheduled daily at 03:30 Madrid time without overlapping', function (): void {
    $events = collect(app(Schedule::class)->events())
        ->filter(fn (Event $event): bool => str_contains((string) $event->command, 'app:drafts:purge'));

    expect($events)->toHaveCount(1);

    $event = $events->first();

    expect($event->expression)->toBe('30 3 * * *')
        ->and($event->timezone)->toBe('Europe/Madrid')
        ->and($event->withoutOverlapping)->toBeTrue();
});
