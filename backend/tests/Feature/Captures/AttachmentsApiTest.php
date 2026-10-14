<?php

declare(strict_types=1);

use App\Enums\TransferLeg;
use App\Models\Account;
use App\Models\Attachment;
use App\Models\Category;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Support\Captures;
use Tests\Support\Ledger;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    Storage::fake('receipts');
    $this->user = User::factory()->create();
    $this->actingAs($this->user);

    $this->checking = Account::factory()->openedOn(day('2026-01-01'))->create(['name' => 'BBVA']);
    $this->groceries = Category::factory()->create(['name' => 'Supermercado']);
    $this->expense = Ledger::expense($this->checking, 2_350, '2026-10-12', $this->groceries, ['description' => 'Compra']);
});

function sentBody(TestResponse $response): string
{
    ob_start();
    $response->baseResponse->sendContent();

    return (string) ob_get_clean();
}

function addReceipt(Transaction $transaction, ?UploadedFile $file = null): Attachment
{
    $id = test()->post("/api/v1/transactions/{$transaction->id}/attachments", ['file' => $file ?? Captures::photo()])
        ->assertCreated()
        ->json('data.id');

    return Attachment::query()->findOrFail($id);
}

it('adds a receipt to an existing movement and infers its kind', function (string $name, string $mime, string $kind): void {
    $this->post("/api/v1/transactions/{$this->expense->id}/attachments", ['file' => UploadedFile::fake()->create($name, 50, $mime)])
        ->assertCreated()
        ->assertJsonPath('data.kind', $kind)
        ->assertJsonPath('data.mime', $mime)
        ->assertJsonPath('data.original_name', $name)
        ->assertJsonPath('data.size_bytes', 50 * 1024);

    $attachment = Attachment::query()->sole();

    expect($attachment->transaction_id)->toBe($this->expense->id)
        ->and($attachment->capture_id)->toBeNull();
    Storage::disk('receipts')->assertExists($attachment->path);

    $this->getJson("/api/v1/transactions/{$this->expense->id}")->assertJsonPath('data.attachments_count', 1);
})->with([
    'photo' => ['ticket.png', 'image/png', 'image'],
    'audio' => ['nota.webm', 'audio/webm', 'audio'],
]);

it('rejects receipts with an unsupported format or size', function (Closure $file): void {
    $this->post("/api/v1/transactions/{$this->expense->id}/attachments", ['file' => $file()])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('file');

    expect(Attachment::query()->count())->toBe(0)
        ->and(Storage::disk('receipts')->allFiles())->toBe([]);
})->with([
    'text file' => [fn () => UploadedFile::fake()->create('notes.txt', 1, 'text/plain')],
    'svg' => [fn () => UploadedFile::fake()->create('ticket.svg', 1, 'image/svg+xml')],
    'image over 8 MB' => [fn () => Captures::photo(kilobytes: 8_193)],
    'audio over 10 MB' => [fn () => Captures::audio(kilobytes: 10_241)],
]);

it('does not attach receipts to balance adjustments', function (): void {
    $adjustment = Transaction::factory()->on($this->checking, day('2026-10-12'))->adjustment(500, 10_000)->create();

    $this->post("/api/v1/transactions/{$adjustment->id}/attachments", ['file' => Captures::photo()])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('file');

    expect(Storage::disk('receipts')->allFiles())->toBe([]);
});

it('streams a receipt inline or as a download with safe headers', function (): void {
    $attachment = addReceipt($this->expense, Captures::photo('ticket mercadona.jpg'));

    $inline = $this->get("/api/v1/attachments/{$attachment->id}")
        ->assertOk()
        ->assertHeader('Content-Type', 'image/jpeg')
        ->assertHeader('X-Content-Type-Options', 'nosniff');

    expect($inline->headers->get('Content-Disposition'))->toStartWith('inline')
        ->and($inline->headers->get('Cache-Control'))->toContain('private')
        ->and($inline->headers->get('Cache-Control'))->toContain('max-age=3600')
        ->and($inline->headers->get('Accept-Ranges'))->toBe('bytes')
        ->and(sentBody($inline))->toBe(Storage::disk('receipts')->get($attachment->path));

    $download = $this->get("/api/v1/attachments/{$attachment->id}?download=1")->assertOk();

    expect($download->headers->get('Content-Disposition'))->toStartWith('attachment')
        ->and($download->headers->get('Content-Disposition'))->toContain('ticket mercadona.jpg');
});

it('serves byte ranges so iOS Safari can play audio receipts', function (): void {
    $attachment = addReceipt($this->expense, UploadedFile::fake()->createWithContent('nota.m4a', 'ABCDEFGHIJ'));
    $attachment->forceFill(['mime' => 'audio/mp4'])->save();

    $partial = $this->get("/api/v1/attachments/{$attachment->id}", ['Range' => 'bytes=0-1'])
        ->assertStatus(206)
        ->assertHeader('Content-Type', 'audio/mp4')
        ->assertHeader('Content-Range', 'bytes 0-1/10')
        ->assertHeader('Accept-Ranges', 'bytes');

    expect(sentBody($partial))->toBe('AB')
        ->and($partial->headers->get('Content-Disposition'))->toStartWith('inline');

    $tail = $this->get("/api/v1/attachments/{$attachment->id}", ['Range' => 'bytes=7-'])
        ->assertStatus(206)
        ->assertHeader('Content-Range', 'bytes 7-9/10');

    expect(sentBody($tail))->toBe('HIJ');
});

it('keeps a usable ASCII fallback for receipts with non-ASCII names', function (): void {
    $attachment = addReceipt($this->expense, Captures::photo('recibo cafetería €.jpg'));

    $download = $this->get("/api/v1/attachments/{$attachment->id}?download=1")->assertOk();

    expect($download->headers->get('Content-Disposition'))
        ->toStartWith('attachment')
        ->toContain("filename*=utf-8''recibo%20cafeter%C3%ADa%20%E2%82%AC.jpg");
});

it('requires authentication to read or delete receipts', function (): void {
    $attachment = addReceipt($this->expense);
    auth()->forgetGuards();
    $this->app['auth']->guard('web')->logout();

    $this->get("/api/v1/attachments/{$attachment->id}")->assertUnauthorized();
    $this->get("/api/v1/attachments/{$attachment->id}?download=1")->assertUnauthorized();
    $this->deleteJson("/api/v1/attachments/{$attachment->id}")->assertUnauthorized();
    $this->getJson("/api/v1/transactions/{$this->expense->id}/attachments")->assertUnauthorized();
    $this->post("/api/v1/transactions/{$this->expense->id}/attachments", ['file' => Captures::photo()])->assertUnauthorized();
});

it('returns 404 for unknown receipts', function (): void {
    $this->get('/api/v1/attachments/01jabcdefghjkmnpqrstvwxyz0')->assertNotFound();
    $this->get('/api/v1/attachments/not-a-ulid')->assertNotFound();
    $this->deleteJson('/api/v1/attachments/01jabcdefghjkmnpqrstvwxyz0')->assertNotFound();
});

it('deletes a receipt linked to a movement', function (): void {
    $attachment = addReceipt($this->expense);

    $this->deleteJson("/api/v1/attachments/{$attachment->id}")->assertNoContent();

    Storage::disk('receipts')->assertMissing($attachment->path);
    expect(Attachment::query()->count())->toBe(0);
});

it('refuses to delete the file of a pending capture', function (): void {
    Captures::voiceDraft(Captures::extraction());
    $attachment = Attachment::query()->sole();

    $this->deleteJson("/api/v1/attachments/{$attachment->id}")
        ->assertConflict()
        ->assertJsonPath('code', 'attachment_not_deletable');

    Storage::disk('receipts')->assertExists($attachment->path);
});

it('lets the reviewer open the file of a pending capture', function (): void {
    Captures::photoDraft(Captures::extraction());
    $attachment = Attachment::query()->sole();

    $this->get("/api/v1/attachments/{$attachment->id}")->assertOk()->assertHeader('Content-Type', 'image/jpeg');
});

it('keeps receipts of soft-deleted movements and restores them with the movement', function (): void {
    $attachment = addReceipt($this->expense);

    $this->deleteJson("/api/v1/transactions/{$this->expense->id}")->assertNoContent();
    Storage::disk('receipts')->assertExists($attachment->path);

    $this->postJson("/api/v1/transactions/{$this->expense->id}/restore")
        ->assertOk()
        ->assertJsonPath('data.attachments_count', 1);
});

it('filters and counts movements by receipts', function (): void {
    $other = Ledger::expense($this->checking, 1_000, '2026-10-11', $this->groceries, ['description' => 'Sin ticket']);
    addReceipt($this->expense);
    addReceipt($this->expense, Captures::audio());

    $this->getJson('/api/v1/transactions?has_attachments=1')
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $this->expense->id)
        ->assertJsonPath('data.0.attachments_count', 2);

    $this->getJson('/api/v1/transactions?has_attachments=0')
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $other->id)
        ->assertJsonPath('data.0.attachments_count', 0);
});

it('lists only the receipts of the requested movement, oldest first', function (): void {
    $other = Ledger::expense($this->checking, 1_000, '2026-10-11', $this->groceries);
    $first = addReceipt($this->expense);
    $this->travel(1)->minutes();
    $second = addReceipt($this->expense, Captures::audio());
    addReceipt($other);

    $this->getJson("/api/v1/transactions/{$this->expense->id}/attachments")
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.id', $first->id)
        ->assertJsonPath('data.1.id', $second->id);
});

it('exposes transfer receipts on both legs', function (): void {
    $savings = Account::factory()->openedOn(day('2026-01-01'))->create(['name' => 'Ahorro']);
    $transferId = $this->postJson('/api/v1/transfers', [
        'from_account_id' => $this->checking->id,
        'to_account_id' => $savings->id,
        'amount_cents' => 10_000,
        'date' => '2026-10-13',
    ])->assertCreated()->json('data.id');
    $outLeg = Transaction::query()->where('transfer_id', $transferId)->where('transfer_leg', TransferLeg::Out->value)->sole();
    $inLeg = Transaction::query()->where('transfer_id', $transferId)->where('transfer_leg', TransferLeg::In->value)->sole();
    $receipt = addReceipt($outLeg);

    $this->getJson("/api/v1/transactions?account_id[]={$savings->id}&has_attachments=1")
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $inLeg->id)
        ->assertJsonPath('data.0.attachments_count', 1);

    $this->getJson("/api/v1/transactions?account_id[]={$savings->id}&has_attachments=0")
        ->assertJsonCount(0, 'data');

    $this->getJson('/api/v1/transactions?has_attachments=1')
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $outLeg->id)
        ->assertJsonPath('data.0.attachments_count', 1);

    $this->getJson("/api/v1/transactions/{$inLeg->id}")->assertJsonPath('data.attachments_count', 1);

    $this->getJson("/api/v1/transactions/{$inLeg->id}/attachments")
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $receipt->id);

    $this->getJson("/api/v1/transactions?account_id[]={$this->checking->id}&has_attachments=1")
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $outLeg->id)
        ->assertJsonPath('data.0.attachments_count', 1);
});
