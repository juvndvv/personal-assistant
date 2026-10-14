<?php

declare(strict_types=1);

use App\Actions\Exports\ExportFullArchive;
use App\Actions\Exports\ExportTransactionsCsv;
use App\Models\Account;
use App\Models\Attachment;
use App\Models\Category;
use App\Models\RecurringTemplate;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Support\Captures;
use Tests\Support\Csv;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    Storage::fake('receipts');
    $this->actingAs(User::factory()->create());

    $this->checking = Account::factory()->openedOn(day('2026-01-01'), 100_000)->create(['name' => 'BBVA']);
    $this->visa = Account::factory()->creditCard(statementDay: 5)->openedOn(day('2026-01-01'))->create(['name' => 'Visa']);
    $this->closed = Account::factory()->openedOn(day('2026-01-01'))->create(['name' => 'Cerrada']);
    $this->food = Category::factory()->create(['name' => 'Alimentación']);
    $this->groceries = Category::factory()->childOf($this->food)->create(['name' => 'Supermercado']);
    $this->salary = Category::factory()->income()->create(['name' => 'Nómina']);

    $this->expenseId = (int) $this->postJson('/api/v1/transactions', [
        'type' => 'expense', 'amount_cents' => 2_350, 'date' => '2026-10-12', 'account_id' => $this->checking->id,
        'category_id' => $this->groceries->id, 'merchant' => 'Mercadona', 'tags' => ['casa'],
    ])->assertCreated()->json('data.id');
    $this->deletedId = (int) $this->postJson('/api/v1/transactions', [
        'type' => 'expense', 'amount_cents' => 999, 'date' => '2026-10-02', 'account_id' => $this->checking->id,
        'category_id' => $this->groceries->id,
    ])->assertCreated()->json('data.id');
    $this->deleteJson("/api/v1/transactions/{$this->deletedId}")->assertNoContent();
    $this->postJson('/api/v1/transfers', [
        'from_account_id' => $this->checking->id, 'to_account_id' => $this->visa->id, 'amount_cents' => 10_000, 'date' => '2026-10-05',
    ])->assertCreated();
    $this->post("/api/v1/transactions/{$this->expenseId}/attachments", ['file' => Captures::photo('ticket.jpg')])->assertCreated();
    $this->putJson("/api/v1/budgets/{$this->food->id}", ['amount_cents' => 40_000, 'effective_from' => '2026-09'])->assertOk();
    RecurringTemplate::factory()->variable()->create(['name' => 'Luz', 'account_id' => $this->checking->id, 'category_id' => $this->food->id]);
    $this->deleteJson("/api/v1/accounts/{$this->closed->id}")->assertNoContent();
    DB::table('settings')->update(['month_start_day' => 25, 'default_account_id' => $this->checking->id]);
});

/**
 * @return array{files: array<string, string>, response: TestResponse}
 */
function downloadArchive(array $query = []): array
{
    $response = test()->get('/api/v1/exports/full.zip'.($query === [] ? '' : '?'.http_build_query($query)))->assertOk();
    $path = $response->baseResponse->getFile()->getPathname();

    $zip = new ZipArchive;
    expect($zip->open($path))->toBeTrue();

    $files = [];

    for ($index = 0; $index < $zip->numFiles; $index++) {
        $name = (string) $zip->getNameIndex($index);
        $files[$name] = (string) $zip->getFromIndex($index);
    }

    $zip->close();
    unlink($path);

    return ['files' => $files, 'response' => $response];
}

it('downloads a ZIP with one CSV per entity', function (): void {
    ['files' => $files, 'response' => $response] = downloadArchive();

    expect($response->headers->get('Content-Type'))->toBe('application/zip')
        ->and($response->headers->get('Content-Disposition'))->toMatch('/^attachment; filename=finanzas-2026-10-13-\d{6}\.zip$/')
        ->and(array_keys($files))->toBe(ExportFullArchive::FILES);

    $headers = array_map(fn (string $content): array => Csv::header($content), $files);

    expect($headers)->toBe([
        'accounts.csv' => ['id', 'name', 'type', 'opening_balance_cents', 'opening_date', 'statement_day', 'settlement_account_id', 'sort_order', 'balance_cents', 'balance_eur', 'archived_at', 'created_at', 'deleted_at'],
        'categories.csv' => ['id', 'kind', 'name', 'parent_id', 'parent_name', 'icon', 'color', 'sort_order', 'archived_at', 'created_at'],
        'transactions.csv' => [...ExportTransactionsCsv::COLUMNS, 'deleted_at'],
        'transfers.csv' => ['id', 'kind', 'date', 'from_account_id', 'from_account', 'to_account_id', 'to_account', 'amount_cents', 'amount_eur', 'note', 'created_at', 'deleted_at'],
        'tags.csv' => ['id', 'name', 'transactions_count', 'created_at'],
        'recurring_templates.csv' => ['id', 'name', 'type', 'amount_cents', 'amount_eur', 'is_variable', 'account_id', 'account', 'category_id', 'category', 'frequency', 'day_of_month', 'starts_on', 'ends_on', 'description', 'merchant', 'note', 'paused_at', 'created_at', 'deleted_at'],
        'budgets.csv' => ['id', 'category_id', 'category', 'effective_from', 'amount_cents', 'amount_eur', 'created_at'],
        'attachments.csv' => ['id', 'transaction_id', 'kind', 'mime', 'size', 'sha256', 'original_name', 'file', 'created_at'],
        'settings.csv' => ['month_start_day', 'default_account_id', 'last_used_account_id', 'orphan_draft_ttl_days', 'updated_at'],
    ]);
});

it('fills every entity file', function (): void {
    ['files' => $files] = downloadArchive();
    $rows = array_map(fn (string $content): array => Csv::rows($content), $files);
    $byName = fn (string $file): array => array_column($rows[$file], null, 'name');

    $accounts = $byName('accounts.csv');
    expect($accounts['BBVA'])->toMatchArray(['type' => 'checking', 'opening_balance_cents' => '100000', 'balance_cents' => '87650', 'balance_eur' => '876,50', 'deleted_at' => ''])
        ->and($accounts['Visa']['balance_cents'])->toBe('10000')
        ->and($accounts['Cerrada'])->toMatchArray(['balance_cents' => '', 'balance_eur' => ''])
        ->and($accounts['Cerrada']['deleted_at'])->not->toBe('');

    expect($byName('categories.csv')['Supermercado'])->toMatchArray(['kind' => 'expense', 'parent_id' => (string) $this->food->id, 'parent_name' => 'Alimentación']);

    $transactions = array_column($rows['transactions.csv'], null, 'id');
    expect($transactions)->toHaveCount(Transaction::withTrashed()->count())
        ->and($transactions[$this->expenseId])->toMatchArray(['tags' => 'casa', 'attachments_count' => '1', 'deleted_at' => ''])
        ->and($transactions[$this->deletedId]['deleted_at'])->toBe((string) Transaction::withTrashed()->findOrFail($this->deletedId)->deleted_at?->toIso8601String());

    expect($rows['transfers.csv'])->toHaveCount(1)
        ->and($rows['transfers.csv'][0])->toMatchArray(['kind' => 'transfer', 'from_account' => 'BBVA', 'to_account' => 'Visa', 'amount_cents' => '10000', 'amount_eur' => '100,00', 'date' => '2026-10-05']);

    expect($byName('tags.csv')['casa']['transactions_count'])->toBe('1');

    expect($byName('recurring_templates.csv')['Luz'])->toMatchArray(['is_variable' => '1', 'account' => 'BBVA', 'category' => 'Alimentación', 'frequency' => 'monthly']);

    expect($rows['budgets.csv'])->toHaveCount(1)
        ->and($rows['budgets.csv'][0])->toMatchArray(['category' => 'Alimentación', 'effective_from' => '2026-09', 'amount_cents' => '40000', 'amount_eur' => '400,00']);

    $attachment = Attachment::query()->sole();
    expect($rows['attachments.csv'])->toBe([[
        'id' => $attachment->id,
        'transaction_id' => (string) $this->expenseId,
        'kind' => 'image',
        'mime' => 'image/jpeg',
        'size' => (string) $attachment->size_bytes,
        'sha256' => $attachment->sha256,
        'original_name' => 'ticket.jpg',
        'file' => '',
        'created_at' => (string) $attachment->created_at?->toIso8601String(),
    ]]);

    expect($rows['settings.csv'])->toHaveCount(1)
        ->and($rows['settings.csv'][0])->toMatchArray(['month_start_day' => '25', 'default_account_id' => (string) $this->checking->id]);
});

it('includes the receipt files only on request', function (): void {
    $attachment = Attachment::query()->sole();
    $receipt = ExportFullArchive::receiptName($attachment);

    expect(downloadArchive()['files'])->not->toHaveKey($receipt);

    ['files' => $files] = downloadArchive(['include_receipts' => 1]);

    expect($receipt)->toBe("receipts/{$attachment->id}.jpg")
        ->and(array_keys($files))->toBe([...ExportFullArchive::FILES, $receipt])
        ->and(hash('sha256', $files[$receipt]))->toBe($attachment->sha256)
        ->and(Csv::rows($files['attachments.csv'])[0]['file'])->toBe($receipt);
});

it('skips receipts of pending captures and missing files', function (): void {
    Captures::photoDraft(Captures::extraction());
    Storage::disk('receipts')->delete(Attachment::query()->whereNotNull('transaction_id')->sole()->path);

    ['files' => $files] = downloadArchive(['include_receipts' => 1]);

    expect(array_keys($files))->toBe(ExportFullArchive::FILES)
        ->and(Csv::rows($files['attachments.csv']))->toHaveCount(1)
        ->and(Csv::rows($files['attachments.csv'])[0]['file'])->toBe('')
        ->and(array_filter(array_keys($files), fn (string $name): bool => str_starts_with($name, ExportFullArchive::RECEIPTS_DIRECTORY.'/')))->toBe([]);
});

it('leaves no temporary files behind', function (): void {
    $directory = realpath(sys_get_temp_dir()).'/finance-export-test-'.bin2hex(random_bytes(6));
    mkdir($directory);

    $export = app()->make(ExportFullArchive::class, ['temporaryDirectory' => $directory]);
    $path = $export->handle(includeReceipts: true);

    expect(glob($directory.'/*'))->toBe([$path]);

    unlink($path);
    rmdir($directory);
});

it('leaves no temporary files behind when a part fails to write', function (): void {
    $directory = realpath(sys_get_temp_dir()).'/finance-export-test-'.bin2hex(random_bytes(6));
    mkdir($directory);
    DB::beginTransaction();
    DB::statement('ALTER TABLE budgets RENAME TO budgets_unavailable');

    $export = app()->make(ExportFullArchive::class, ['temporaryDirectory' => $directory]);

    expect(fn () => $export->handle(includeReceipts: true))->toThrow(QueryException::class);

    DB::rollBack();

    expect(glob($directory.'/*'))->toBe([]);

    rmdir($directory);
});

it('validates the archive options', function (array $query, string $field): void {
    $this->getJson('/api/v1/exports/full.zip?'.http_build_query($query))
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);
})->with([
    'include_receipts' => [['include_receipts' => 'yes'], 'include_receipts'],
    'delimiter' => [['delimiter' => 'pipe'], 'delimiter'],
]);
