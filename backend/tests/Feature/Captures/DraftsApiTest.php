<?php

declare(strict_types=1);

use App\Enums\DraftStatus;
use App\Enums\TransactionOrigin;
use App\Enums\TransferLeg;
use App\Models\Account;
use App\Models\Attachment;
use App\Models\Category;
use App\Models\Draft;
use App\Models\Transaction;
use App\Models\Transfer;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Storage;
use Tests\Support\Captures;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    Storage::fake('receipts');
    $this->actingAs(User::factory()->create());

    $this->checking = Account::factory()->openedOn(day('2026-01-01'))->create(['name' => 'BBVA']);
    $this->savings = Account::factory()->openedOn(day('2026-01-01'))->create(['name' => 'Ahorro']);
    $this->visa = Account::factory()->creditCard(statementDay: 5)->openedOn(day('2026-01-01'))->create(['name' => 'Visa']);
    $this->groceries = Category::factory()->create(['name' => 'Supermercado']);
    $this->restaurants = Category::factory()->create(['name' => 'Restaurantes']);
});

function confirmPayload(Draft $draft, array $overrides = []): array
{
    return [
        'type' => $draft->type?->value,
        'amount_cents' => $draft->amount_cents,
        'date' => $draft->date?->toDateString(),
        'account_id' => $draft->account_id,
        'category_id' => $draft->category_id,
        'description' => $draft->description,
        'merchant' => $draft->merchant,
        'draft_id' => $draft->id,
        ...$overrides,
    ];
}

it('confirms an unedited voice draft into a voice movement that keeps its receipt', function (): void {
    $draft = Captures::voiceDraft(Captures::extraction([
        'account_id' => $this->visa->id,
        'category_id' => $this->groceries->id,
    ]));

    expect(Transaction::query()->count())->toBe(0);

    $response = $this->postJson('/api/v1/transactions', confirmPayload($draft, ['tags' => ['casa']]))
        ->assertCreated()
        ->assertJsonPath('data.origin', 'voice')
        ->assertJsonPath('data.amount_cents', 2000)
        ->assertJsonPath('data.attachments_count', 1)
        ->assertJsonPath('data.tags.0.name', 'casa');

    $transactionId = $response->json('data.id');
    $draft->refresh();
    $attachment = Attachment::query()->sole();

    expect($draft->status)->toBe(DraftStatus::Confirmed)
        ->and($draft->confirmed_at?->toIso8601String())->toBe('2026-10-13T10:00:00+02:00')
        ->and($draft->transaction_id)->toBe($transactionId)
        ->and($draft->corrected_fields)->toBe([])
        ->and($attachment->transaction_id)->toBe($transactionId)
        ->and($attachment->capture_id)->toBe($draft->capture_id);

    $this->getJson("/api/v1/transactions/{$transactionId}/attachments")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $attachment->id)
        ->assertJsonPath('data.0.url', "/api/v1/attachments/{$attachment->id}")
        ->assertJsonPath('data.0.download_url', "/api/v1/attachments/{$attachment->id}?download=1");

    $this->get("/api/v1/attachments/{$attachment->id}")->assertOk();
    $this->get("/api/v1/attachments/{$attachment->id}?download=1")
        ->assertOk()
        ->assertDownload('nota.m4a');

    $this->getJson("/api/v1/drafts/{$draft->id}")
        ->assertOk()
        ->assertJsonPath('data.status', 'confirmed')
        ->assertJsonPath('data.transaction_id', $transactionId)
        ->assertJsonPath('data.corrected_fields', []);
});

it('records the fields the user corrected at confirmation', function (): void {
    $draft = Captures::photoDraft(Captures::extraction([
        'account_id' => $this->visa->id,
        'category_id' => $this->groceries->id,
    ]));

    $this->postJson('/api/v1/transactions', confirmPayload($draft, [
        'category_id' => $this->restaurants->id,
        'amount_cents' => 2150,
        'merchant' => '  Mercadona  ',
        'date' => null,
    ]))
        ->assertCreated()
        ->assertJsonPath('data.origin', 'photo');

    expect($draft->refresh()->corrected_fields)->toBe(['amount_cents', 'category_id']);
});

it('fills a failed-capture draft by hand and records every field it had to correct', function (): void {
    $draft = Captures::voiceDraft(Captures::extraction(['amount_cents' => null, 'category_id' => null]));

    $this->postJson('/api/v1/transactions', confirmPayload($draft, [
        'amount_cents' => 2000,
        'category_id' => $this->groceries->id,
    ]))->assertCreated();

    expect($draft->refresh()->corrected_fields)->toBe(['amount_cents', 'category_id']);
});

it('rejects a second confirmation with 409 and creates only one movement', function (): void {
    $draft = Captures::voiceDraft(Captures::extraction(['category_id' => $this->groceries->id]));

    $this->postJson('/api/v1/transactions', confirmPayload($draft))->assertCreated();
    $this->postJson('/api/v1/transactions', confirmPayload($draft))
        ->assertConflict()
        ->assertJsonPath('code', 'draft_not_pending');

    expect(Transaction::query()->count())->toBe(1);
});

it('leaves the draft pending when the confirmation fails validation', function (): void {
    $draft = Captures::voiceDraft(Captures::extraction(['category_id' => $this->groceries->id]));

    $this->postJson('/api/v1/transactions', confirmPayload($draft, ['date' => '2025-01-01']))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('date');

    expect($draft->refresh()->status)->toBe(DraftStatus::Pending)
        ->and(Attachment::query()->sole()->transaction_id)->toBeNull()
        ->and(Transaction::query()->count())->toBe(0);
});

it('rejects an unknown draft with 422', function (): void {
    $this->postJson('/api/v1/transactions', [
        'type' => 'expense', 'amount_cents' => 100, 'category_id' => $this->groceries->id, 'draft_id' => 999_999,
    ])->assertUnprocessable()->assertJsonValidationErrors('draft_id');
});

it('confirms a transfer draft through /transfers and keeps the receipt on the out leg', function (): void {
    $draft = Captures::voiceDraft(Captures::extraction([
        'type' => 'transfer',
        'amount_cents' => 10_000,
        'account_id' => $this->checking->id,
        'to_account_id' => $this->savings->id,
    ]), 'Pasa cien euros a la hucha');

    expect($draft->type?->value)->toBe('transfer');

    $response = $this->postJson('/api/v1/transfers', [
        'from_account_id' => $this->checking->id,
        'to_account_id' => $this->savings->id,
        'amount_cents' => 10_000,
        'date' => '2026-10-13',
        'draft_id' => $draft->id,
    ])
        ->assertCreated()
        ->assertJsonPath('data.origin', 'voice');

    $transfer = Transfer::query()->findOrFail($response->json('data.id'));
    $outLeg = $transfer->legs()->where('transfer_leg', TransferLeg::Out->value)->sole();

    expect($draft->refresh())
        ->status->toBe(DraftStatus::Confirmed)
        ->transfer_id->toBe($transfer->id)
        ->transaction_id->toBeNull()
        ->corrected_fields->toBe([])
        ->and(Attachment::query()->sole()->transaction_id)->toBe($outLeg->id)
        ->and($transfer->legs()->pluck('origin')->all())->each->toBe(TransactionOrigin::Voice);

    $this->postJson('/api/v1/transfers', [
        'from_account_id' => $this->checking->id,
        'to_account_id' => $this->savings->id,
        'amount_cents' => 10_000,
        'draft_id' => $draft->id,
    ])->assertConflict()->assertJsonPath('code', 'draft_not_pending');
});

it('records a type correction when an expense draft is confirmed as a transfer', function (): void {
    $draft = Captures::voiceDraft(Captures::extraction(['account_id' => $this->checking->id]));

    $this->postJson('/api/v1/transfers', [
        'from_account_id' => $this->checking->id,
        'to_account_id' => $this->savings->id,
        'amount_cents' => 2000,
        'date' => '2026-10-13',
        'draft_id' => $draft->id,
    ])->assertCreated();

    expect($draft->refresh()->corrected_fields)->toBe(['type', 'to_account_id']);
});

it('discards a draft and deletes its files and attachment rows immediately', function (): void {
    $draft = Captures::voiceDraft(Captures::extraction());
    $attachment = Attachment::query()->sole();
    Storage::disk('receipts')->assertExists($attachment->path);

    $this->postJson("/api/v1/drafts/{$draft->id}/discard")
        ->assertOk()
        ->assertJsonPath('data.status', 'discarded')
        ->assertJsonPath('data.discarded_at', '2026-10-13T10:00:00+02:00')
        ->assertJsonPath('data.capture.attachments', []);

    Storage::disk('receipts')->assertMissing($attachment->path);
    expect(Attachment::query()->count())->toBe(0)
        ->and(Transaction::query()->count())->toBe(0);

    $this->postJson("/api/v1/drafts/{$draft->id}/discard")
        ->assertConflict()
        ->assertJsonPath('code', 'draft_not_pending');
    $this->postJson('/api/v1/transactions', confirmPayload($draft, ['category_id' => $this->groceries->id]))
        ->assertConflict()
        ->assertJsonPath('code', 'draft_not_pending');
});

it('cannot discard a confirmed draft', function (): void {
    $draft = Captures::voiceDraft(Captures::extraction(['category_id' => $this->groceries->id]));
    $this->postJson('/api/v1/transactions', confirmPayload($draft))->assertCreated();

    $this->postJson("/api/v1/drafts/{$draft->id}/discard")->assertConflict();

    expect(Attachment::query()->sole()->transaction_id)->not->toBeNull();
});

it('lists pending drafts newest first by default with a total for the inbox badge', function (): void {
    $first = Captures::voiceDraft(Captures::extraction());
    $this->travel(1)->minutes();
    $second = Captures::photoDraft(Captures::extraction());
    $this->travel(1)->minutes();
    $discarded = Captures::voiceDraft(Captures::extraction());
    $this->postJson("/api/v1/drafts/{$discarded->id}/discard")->assertOk();

    $this->getJson('/api/v1/drafts')
        ->assertOk()
        ->assertJsonPath('meta.total', 2)
        ->assertJsonPath('data.0.id', $second->id)
        ->assertJsonPath('data.1.id', $first->id)
        ->assertJsonPath('data.0.capture.attachments.0.kind', 'image');

    $this->getJson('/api/v1/drafts?origin[]=voice')
        ->assertJsonPath('meta.total', 1)
        ->assertJsonPath('data.0.id', $first->id);

    $this->getJson('/api/v1/drafts?status=discarded')
        ->assertJsonPath('meta.total', 1)
        ->assertJsonPath('data.0.id', $discarded->id);

    $this->getJson('/api/v1/drafts?per_page=1')
        ->assertJsonPath('meta.per_page', 1)
        ->assertJsonCount(1, 'data');
});

it('validates the draft list filters', function (string $query, string $field): void {
    $this->getJson('/api/v1/drafts?'.$query)->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    ['status=archived', 'status'],
    ['origin[]=email', 'origin.0'],
    ['per_page=101', 'per_page'],
]);

it('returns 404 for unknown drafts', function (): void {
    $this->getJson('/api/v1/drafts/999999')->assertNotFound();
    $this->getJson('/api/v1/drafts/abc')->assertNotFound();
    $this->postJson('/api/v1/drafts/999999/discard')->assertNotFound();
});

it('refuses to delete a category referenced by a pending draft', function (): void {
    Captures::voiceDraft(Captures::extraction(['category_id' => $this->groceries->id]));

    $this->deleteJson("/api/v1/categories/{$this->groceries->id}")
        ->assertConflict()
        ->assertJsonPath('code', 'category_in_use');
});
