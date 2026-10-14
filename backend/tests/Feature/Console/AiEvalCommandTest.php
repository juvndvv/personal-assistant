<?php

declare(strict_types=1);

use App\Ai\Agents\TransactionExtractor;
use App\Models\Account;
use App\Models\Category;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Laravel\Ai\Transcription;
use Tests\Support\Captures;

beforeEach(function (): void {
    $this->samples = sys_get_temp_dir().'/ai-eval-'.uniqid();
    File::ensureDirectoryExists($this->samples);

    $this->visa = Account::factory()->creditCard()->openedOn(day('2026-01-01'))->create(['name' => 'Visa']);
    $this->groceries = Category::factory()->create(['name' => 'Supermercado']);
});

afterEach(function (): void {
    File::deleteDirectory($this->samples);
});

it('scores each field and reports latency using the faked pipeline', function (): void {
    File::put($this->samples.'/mercadona.m4a', 'audio-bytes');
    File::put($this->samples.'/mercadona.expected.json', json_encode([
        'today' => '2026-10-13',
        'amount_cents' => 2000,
        'account_id' => $this->visa->id,
        'merchant' => 'mercadona',
    ]));
    File::put($this->samples.'/ticket.jpg', 'image-bytes');
    File::put($this->samples.'/ticket.expected.json', json_encode(['amount_cents' => 4537, 'category_id' => $this->groceries->id]));
    File::put($this->samples.'/unpaired.jpg', 'image-bytes');

    Transcription::fake(['Veinte euros en Mercadona con la Visa'])->preventStrayTranscriptions();
    TransactionExtractor::fake([
        Captures::extraction(['account_id' => $this->visa->id, 'merchant' => 'Mercadona ']),
        Captures::extraction(['amount_cents' => 4500, 'category_id' => $this->groceries->id]),
    ])->preventStrayPrompts();

    $exitCode = $this->withoutMockingConsoleOutput()->artisan('app:ai-eval', ['dir' => $this->samples]);
    $output = Artisan::output();

    expect($exitCode)->toBe(0)
        ->and($output)->toContain('amount_cents=4500 (expected 4537)')
        ->and($output)->toContain('50.0 %')
        ->and($output)->toMatch('/Latency over 2 samples: p50 \\d+ ms, p90 \\d+ ms, p95 \\d+ ms, max \\d+ ms\\./');

    TransactionExtractor::assertPromptedTimes(2);
});

it('fails when the directory has no usable samples', function (): void {
    $this->artisan('app:ai-eval', ['dir' => $this->samples])->assertFailed();
    $this->artisan('app:ai-eval', ['dir' => $this->samples.'/missing'])->assertFailed();
});
