<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\RawLedger;

/**
 * @param  array<string, mixed>  $overrides
 */
function rawCapture(array $overrides = []): string
{
    $id = Str::lower((string) Str::ulid());

    DB::table('captures')->insert([
        'id' => $id,
        'kind' => 'voice',
        'created_at' => now(),
        'updated_at' => now(),
        ...$overrides,
    ]);

    return $id;
}

/**
 * @param  array<string, mixed>  $overrides
 */
function rawDraft(array $overrides = []): int
{
    return (int) DB::table('drafts')->insertGetId([
        'origin' => 'voice',
        'capture_id' => array_key_exists('capture_id', $overrides) ? $overrides['capture_id'] : rawCapture(),
        'created_at' => now(),
        'updated_at' => now(),
        ...$overrides,
    ]);
}

/**
 * @param  array<string, mixed>  $overrides
 */
function rawAttachment(array $overrides = []): string
{
    $id = Str::lower((string) Str::ulid());

    DB::table('attachments')->insert([
        'id' => $id,
        'capture_id' => array_key_exists('capture_id', $overrides) ? $overrides['capture_id'] : rawCapture(),
        'kind' => 'audio',
        'disk' => 'receipts',
        'path' => "2026/10/{$id}.m4a",
        'mime' => 'audio/mp4',
        'size_bytes' => 1024,
        'sha256' => str_repeat('a', 64),
        'created_at' => now(),
        'updated_at' => now(),
        ...$overrides,
    ]);

    return $id;
}

it('accepts a valid capture, draft and attachment', function (): void {
    RawLedger::expectAccepted(function (): void {
        $captureId = rawCapture(['transcript' => 'Veinte euros en Mercadona']);
        rawDraft(['capture_id' => $captureId, 'amount_cents' => 2000, 'confidence' => '{"amount_cents": 0.9}']);
        rawAttachment(['capture_id' => $captureId]);
    });

    expect(DB::table('drafts')->value('status'))->toBe('pending')
        ->and(DB::table('drafts')->value('low_confidence_fields'))->toBe('[]')
        ->and(DB::table('captures')->value('status'))->toBe('processing');
});

it('rejects invalid capture rows', function (array $values, string $constraint): void {
    RawLedger::expectRejected(fn () => rawCapture($values), $constraint);
})->with([
    'unknown kind' => [['kind' => 'video'], 'captures_kind_check'],
    'unknown status' => [['status' => 'queued'], 'captures_status_check'],
    'transcript on a photo' => [['kind' => 'photo', 'transcript' => 'texto'], 'captures_transcript_voice_only'],
]);

it('rejects invalid draft rows', function (Closure $values, string $constraint): void {
    RawLedger::expectRejected(fn () => rawDraft($values()), $constraint);
})->with([
    'unknown origin' => [fn (): array => ['origin' => 'email', 'capture_id' => null], 'drafts_origin_check'],
    'unknown status' => [fn (): array => ['status' => 'archived'], 'drafts_status_check'],
    'unknown type' => [fn (): array => ['type' => 'refund'], 'drafts_type_check'],
    'zero amount' => [fn (): array => ['amount_cents' => 0], 'drafts_amount_positive'],
    'negative amount' => [fn (): array => ['amount_cents' => -100], 'drafts_amount_positive'],
    'voice draft without capture' => [fn (): array => ['capture_id' => null], 'drafts_capture_origin'],
    'recurring draft with capture' => [fn (): array => ['origin' => 'recurring'], 'drafts_capture_origin'],
    'confirmed without timestamp' => [fn (): array => ['status' => 'confirmed', 'transaction_id' => null], 'drafts_confirmed_at'],
    'timestamp without confirmation' => [fn (): array => ['confirmed_at' => now()], 'drafts_confirmed_at'],
    'discarded without timestamp' => [fn (): array => ['status' => 'discarded'], 'drafts_discarded_at'],
    'confirmed without ledger row' => [fn (): array => ['status' => 'confirmed', 'confirmed_at' => now()], 'drafts_confirmed_link'],
    'unknown account' => [fn (): array => ['account_id' => 999_999], 'drafts_account_fk'],
    'unknown category' => [fn (): array => ['category_id' => 999_999], 'drafts_category_fk'],
]);

it('allows one draft per capture', function (): void {
    $captureId = rawCapture();
    rawDraft(['capture_id' => $captureId]);

    RawLedger::expectRejected(fn () => rawDraft(['capture_id' => $captureId]), 'drafts_capture_unique');
});

it('cascades the draft when its capture is deleted and nulls deleted references', function (): void {
    $accountId = RawLedger::account();
    $categoryId = RawLedger::category();
    $captureId = rawCapture();
    $draftId = rawDraft(['capture_id' => $captureId, 'account_id' => $accountId, 'category_id' => $categoryId]);

    DB::table('categories')->where('id', $categoryId)->delete();
    expect(DB::table('drafts')->where('id', $draftId)->value('category_id'))->toBeNull();

    DB::table('captures')->where('id', $captureId)->delete();
    expect(DB::table('drafts')->where('id', $draftId)->exists())->toBeFalse();
});

it('rejects invalid attachment rows', function (Closure $values, string $constraint): void {
    RawLedger::expectRejected(fn () => rawAttachment($values()), $constraint);
})->with([
    'unknown kind' => [fn (): array => ['kind' => 'video'], 'attachments_kind_check'],
    'empty file' => [fn (): array => ['size_bytes' => 0], 'attachments_size_positive'],
    'no owner' => [fn (): array => ['capture_id' => null, 'transaction_id' => null], 'attachments_owner'],
    'unknown transaction' => [fn (): array => ['transaction_id' => 999_999], 'attachments_transaction_fk'],
]);

it('rejects two attachments on the same disk path', function (): void {
    rawAttachment(['path' => '2026/10/same.jpg']);

    RawLedger::expectRejected(fn () => rawAttachment(['path' => '2026/10/same.jpg']), 'attachments_disk_path_unique');
});

it('keeps receipts from blocking capture deletes but protects ledger rows', function (): void {
    $accountId = RawLedger::account();
    $transactionId = RawLedger::transaction(['account_id' => $accountId, 'category_id' => RawLedger::category()]);
    $captureId = rawCapture();
    $attachmentId = rawAttachment(['capture_id' => $captureId, 'transaction_id' => $transactionId]);

    DB::table('captures')->where('id', $captureId)->delete();
    expect(DB::table('attachments')->where('id', $attachmentId)->value('capture_id'))->toBeNull();

    RawLedger::expectRejected(
        fn () => DB::table('transactions')->where('id', $transactionId)->delete(),
        'attachments_transaction_fk',
    );
});
