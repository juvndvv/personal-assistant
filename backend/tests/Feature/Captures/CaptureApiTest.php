<?php

declare(strict_types=1);

use App\Ai\Agents\TransactionExtractor;
use App\Ai\CaptureFailureMessage;
use App\Models\Account;
use App\Models\Attachment;
use App\Models\Capture;
use App\Models\Category;
use App\Models\Draft;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use GuzzleHttp\Psr7\Response as Psr7Response;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response as ClientResponse;
use Illuminate\Support\Facades\Storage;
use Laravel\Ai\Exceptions\ProviderConnectionException;
use Laravel\Ai\Exceptions\ProviderOverloadedException;
use Laravel\Ai\Files\StoredImage;
use Laravel\Ai\Prompts\AgentPrompt;
use Laravel\Ai\Prompts\TranscriptionPrompt;
use Laravel\Ai\Transcription;
use Tests\Support\Captures;
use Tests\Support\Ledger;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    Storage::fake('receipts');
    $this->actingAs(User::factory()->create());

    $this->checking = Account::factory()->openedOn(day('2026-01-01'))->create(['name' => 'BBVA']);
    $this->visa = Account::factory()->creditCard(statementDay: 5)->openedOn(day('2026-01-01'))->create(['name' => 'Visa']);
    $this->food = Category::factory()->create(['name' => 'Alimentación']);
    $this->groceries = Category::factory()->childOf($this->food)->create(['name' => 'Supermercado']);
    $this->salary = Category::factory()->income()->create(['name' => 'Nómina']);
});

it('turns a voice note into an editable draft without touching the ledger', function (): void {
    $response = Captures::postVoice('Veinte euros en Mercadona con la Visa', Captures::extraction([
        'account_id' => $this->visa->id,
        'category_id' => $this->groceries->id,
    ]), ['client_started_at' => '2026-10-13T09:59:50+02:00']);

    $response->assertCreated()
        ->assertJsonPath('data.capture.kind', 'voice')
        ->assertJsonPath('data.capture.status', 'completed')
        ->assertJsonPath('data.capture.transcript', 'Veinte euros en Mercadona con la Visa')
        ->assertJsonPath('data.capture.error', null)
        ->assertJsonPath('data.capture.attachments.0.kind', 'audio')
        ->assertJsonPath('data.capture.attachments.0.mime', 'audio/mp4')
        ->assertJsonPath('data.draft.origin', 'voice')
        ->assertJsonPath('data.draft.status', 'pending')
        ->assertJsonPath('data.draft.proposal', [
            'type' => 'expense',
            'amount_cents' => 2000,
            'date' => '2026-10-13',
            'account_id' => $this->visa->id,
            'to_account_id' => null,
            'category_id' => $this->groceries->id,
            'description' => 'Mercadona',
            'merchant' => 'Mercadona',
        ])
        ->assertJsonPath('data.draft.low_confidence_fields', [])
        ->assertJsonPath('data.draft.field_sources.amount_cents', 'ai')
        ->assertJsonPath('data.draft.capture.id', $response->json('data.capture.id'))
        ->assertJsonPath('data.draft.recurring', null);

    expect(Transaction::query()->count())->toBe(0)
        ->and(Draft::query()->pending()->count())->toBe(1);

    $capture = Capture::query()->sole();
    $attachment = Attachment::query()->sole();

    expect($capture->client_started_at?->toIso8601String())->toBe('2026-10-13T09:59:50+02:00')
        ->and($capture->provider)->toBe('openai')
        ->and($capture->raw_extraction['amount_cents'] ?? null)->toBe(2000)
        ->and($capture->transcription_ms)->toBeInt()
        ->and($capture->extraction_ms)->toBeInt()
        ->and($attachment->capture_id)->toBe($capture->id)
        ->and($attachment->transaction_id)->toBeNull()
        ->and($attachment->path)->toEndWith('.m4a')
        ->and($attachment->sha256)->toHaveLength(64)
        ->and($attachment->original_name)->toBe('nota.m4a');

    Storage::disk('receipts')->assertExists($attachment->path);

    Transcription::assertGenerated(fn (TranscriptionPrompt $prompt): bool => $prompt->audio->name() === 'audio.m4a'
        && $prompt->audio->mimeType() === 'audio/mp4'
        && $prompt->language === 'es');
    TransactionExtractor::assertPrompted(fn (AgentPrompt $prompt): bool => $prompt->contains('Veinte euros en Mercadona con la Visa')
        && $prompt->attachments->isEmpty());
});

it('stores the client capture start as the same instant whatever offset the client sends', function (string $sent, string $stored): void {
    Captures::postVoice('Veinte euros en Mercadona', Captures::extraction(), ['client_started_at' => $sent])
        ->assertCreated();

    expect(Capture::query()->sole()->client_started_at?->toIso8601String())->toBe($stored);
})->with([
    'utc from toISOString in summer time' => ['2026-10-13T07:59:50.123Z', '2026-10-13T09:59:50+02:00'],
    'utc in winter time' => ['2026-12-01T08:00:00Z', '2026-12-01T09:00:00+01:00'],
    'foreign offset' => ['2026-10-13T03:59:50-04:00', '2026-10-13T09:59:50+02:00'],
    'madrid offset' => ['2026-10-13T09:59:50+02:00', '2026-10-13T09:59:50+02:00'],
]);

it('turns a receipt photo into an editable draft by sending the image to the extractor', function (): void {
    $response = Captures::postPhoto(Captures::extraction([
        'amount_cents' => 4537,
        'date' => '2026-10-11',
        'merchant' => 'Farmacia Sol',
        'account_id' => $this->checking->id,
        'category_id' => $this->groceries->id,
    ]));

    $response->assertCreated()
        ->assertJsonPath('data.capture.kind', 'photo')
        ->assertJsonPath('data.capture.transcript', null)
        ->assertJsonPath('data.capture.attachments.0.kind', 'image')
        ->assertJsonPath('data.draft.origin', 'photo')
        ->assertJsonPath('data.draft.proposal.amount_cents', 4537)
        ->assertJsonPath('data.draft.proposal.date', '2026-10-11')
        ->assertJsonPath('data.draft.proposal.merchant', 'Farmacia Sol');

    $attachment = Attachment::query()->sole();

    Transcription::assertNothingGenerated();
    TransactionExtractor::assertPrompted(function (AgentPrompt $prompt) use ($attachment): bool {
        $image = $prompt->attachments->first();

        return $image instanceof StoredImage
            && $image->path === $attachment->path
            && $image->disk === 'receipts'
            && $image->mimeType() === 'image/jpeg';
    });
    expect(Transaction::query()->count())->toBe(0);
});

it('sends today, the active accounts and categories, and never the movement history', function (): void {
    Account::factory()->archived()->create(['name' => 'Cuenta Antigua']);
    Ledger::expense($this->checking, 9_900, '2026-10-01', $this->groceries, ['description' => 'Cena secreta en Casa Pepe']);

    Captures::postVoice('Doce con cincuenta ayer en el bar', Captures::extraction())->assertCreated();

    TransactionExtractor::assertPrompted(function (AgentPrompt $prompt): bool {
        $instructions = (string) $prompt->agent->instructions();

        return str_contains($instructions, 'martes 2026-10-13')
            && str_contains($instructions, '"name":"Visa"')
            && str_contains($instructions, '"name":"Supermercado","kind":"expense","parent":"Alimentación"')
            && str_contains($instructions, '"name":"Nómina","kind":"income"')
            && ! str_contains($instructions, 'Cuenta Antigua')
            && ! str_contains($instructions, 'Casa Pepe')
            && ! str_contains($prompt->prompt, 'Casa Pepe');
    });
});

it('flags low-confidence and sanitized fields in the API', function (): void {
    Captures::postVoice('Algo en algún sitio', Captures::extraction([
        'amount_cents' => -500,
        'date' => '2026-12-01',
        'account_id' => 999_999,
        'category_id' => $this->salary->id,
        'confidence' => ['merchant' => 0.4],
    ]))
        ->assertCreated()
        ->assertJsonPath('data.capture.status', 'completed')
        ->assertJsonPath('data.draft.proposal.amount_cents', null)
        ->assertJsonPath('data.draft.proposal.date', '2026-10-13')
        ->assertJsonPath('data.draft.proposal.account_id', $this->checking->id)
        ->assertJsonPath('data.draft.proposal.category_id', null)
        ->assertJsonPath('data.draft.field_sources.account_id', 'default')
        ->assertJsonPath('data.draft.confidence.date', 0.3)
        ->assertJsonPath('data.draft.low_confidence_fields', ['amount_cents', 'date', 'account_id', 'category_id', 'merchant']);
});

it('keeps the scheduled date of a future transfer and flags it for review', function (): void {
    $savings = Account::factory()->openedOn(day('2026-01-01'))->create(['name' => 'Ahorro']);

    Captures::postVoice('Traspasa 200 euros a ahorro el día 30', Captures::extraction([
        'type' => 'transfer',
        'amount_cents' => 20000,
        'date' => '2026-10-30',
        'account_id' => $this->checking->id,
        'to_account_id' => $savings->id,
        'category_id' => null,
        'confidence' => ['to_account_id' => 0.9, 'category_id' => 0.0],
    ]))
        ->assertCreated()
        ->assertJsonPath('data.draft.proposal.type', 'transfer')
        ->assertJsonPath('data.draft.proposal.date', '2026-10-30')
        ->assertJsonPath('data.draft.proposal.to_account_id', $savings->id)
        ->assertJsonPath('data.draft.confidence.date', 0.3)
        ->assertJsonPath('data.draft.field_sources.date', 'ai')
        ->assertJsonPath('data.draft.low_confidence_fields', ['date']);
});

it('moves a future date to today when a transfer without destination becomes an expense', function (): void {
    Captures::postVoice('Traspasa 200 euros el día 30', Captures::extraction([
        'type' => 'transfer',
        'date' => '2026-10-30',
        'account_id' => $this->checking->id,
        'to_account_id' => null,
        'category_id' => $this->groceries->id,
    ]))
        ->assertCreated()
        ->assertJsonPath('data.draft.proposal.type', 'expense')
        ->assertJsonPath('data.draft.proposal.date', '2026-10-13')
        ->assertJsonPath('data.draft.confidence.date', 0.3);
});

it('returns 201 with a usable draft and the transcript when the extractor fails', function (Closure $failure): void {
    Transcription::fake(['Veinte euros en Mercadona'])->preventStrayTranscriptions();
    TransactionExtractor::fake($failure)->preventStrayPrompts();

    $this->post('/api/v1/captures', ['kind' => 'voice', 'file' => Captures::audio()])
        ->assertCreated()
        ->assertJsonPath('data.capture.status', 'failed')
        ->assertJsonPath('data.capture.transcript', 'Veinte euros en Mercadona')
        ->assertJsonPath('data.draft.status', 'pending')
        ->assertJsonPath('data.draft.proposal', [
            'type' => 'expense',
            'amount_cents' => null,
            'date' => '2026-10-13',
            'account_id' => $this->checking->id,
            'to_account_id' => null,
            'category_id' => null,
            'description' => 'Veinte euros en Mercadona',
            'merchant' => null,
        ])
        ->assertJsonPath('data.draft.low_confidence_fields', ['amount_cents', 'category_id', 'description', 'merchant']);

    expect(Capture::query()->sole()->error)->toBeString()->not->toBe('')
        ->and(Transaction::query()->count())->toBe(0)
        ->and(Attachment::query()->count())->toBe(1);
})->with([
    'provider exception' => [fn () => fn () => throw new RuntimeException('OpenAI returned 500')],
    'provider timeout' => [fn () => fn () => throw new ProviderConnectionException('cURL error 28: Operation timed out after 12000 milliseconds')],
    'malformed output' => [fn () => fn () => 'not json at all'],
]);

it('returns a failed capture without a transcript when speech recognition fails', function (): void {
    Transcription::fake(fn () => throw new RuntimeException('speech service down'))->preventStrayTranscriptions();

    $this->post('/api/v1/captures', ['kind' => 'voice', 'file' => Captures::audio()])
        ->assertCreated()
        ->assertJsonPath('data.capture.status', 'failed')
        ->assertJsonPath('data.capture.error', CaptureFailureMessage::GENERIC)
        ->assertJsonPath('data.capture.transcript', null)
        ->assertJsonPath('data.draft.proposal.description', null);

    TransactionExtractor::assertNeverPrompted();
});

it('fails a recording without recognizable speech', function (): void {
    Transcription::fake(['   '])->preventStrayTranscriptions();

    $this->post('/api/v1/captures', ['kind' => 'voice', 'file' => Captures::audio()])
        ->assertCreated()
        ->assertJsonPath('data.capture.status', 'failed');

    TransactionExtractor::assertNeverPrompted();
});

it('stops before extraction once the overall deadline has passed and keeps the transcript', function (): void {
    Transcription::fake(function (): string {
        $this->travel(16)->seconds();

        return 'Veinte euros en Mercadona';
    })->preventStrayTranscriptions();

    $this->post('/api/v1/captures', ['kind' => 'voice', 'file' => Captures::audio()])
        ->assertCreated()
        ->assertJsonPath('data.capture.status', 'failed')
        ->assertJsonPath('data.capture.transcript', 'Veinte euros en Mercadona')
        ->assertJsonPath('data.draft.proposal.description', 'Veinte euros en Mercadona');

    TransactionExtractor::assertNeverPrompted();
    expect(Capture::query()->sole()->error)->toBe(CaptureFailureMessage::TIMED_OUT);
});

it('caps each provider call by the provider timeout and the time left before the deadline', function (): void {
    Transcription::fake(function (): string {
        $this->travel(5)->seconds();

        return 'Veinte euros';
    })->preventStrayTranscriptions();
    TransactionExtractor::fake([Captures::extraction()])->preventStrayPrompts();

    $this->post('/api/v1/captures', ['kind' => 'voice', 'file' => Captures::audio()])->assertCreated();

    Transcription::assertGenerated(fn (TranscriptionPrompt $prompt): bool => $prompt->timeout === 12);
    TransactionExtractor::assertPrompted(fn (AgentPrompt $prompt): bool => $prompt->timeout === 10);
});

it('passes the provider and model from configuration to the SDK', function (): void {
    config([
        'ai.finance.extraction.provider' => 'anthropic',
        'ai.finance.extraction.model' => 'configured-extraction-model',
        'ai.finance.transcription.provider' => 'groq',
        'ai.finance.transcription.model' => 'configured-transcription-model',
    ]);

    Captures::postVoice('Veinte euros', Captures::extraction())->assertCreated();

    Transcription::assertGenerated(fn (TranscriptionPrompt $prompt): bool => $prompt->provider->name() === 'groq'
        && $prompt->model === 'configured-transcription-model');
    TransactionExtractor::assertPrompted(fn (AgentPrompt $prompt): bool => $prompt->provider->name() === 'anthropic'
        && $prompt->model === 'configured-extraction-model');

    expect(Capture::query()->sole())
        ->provider->toBe('anthropic')
        ->model->toBe('configured-extraction-model');
});

it('fails over to the configured providers when the primary one is overloaded', function (): void {
    config([
        'ai.finance.extraction.provider' => 'openai',
        'ai.finance.extraction.model' => 'configured-extraction-model',
        'ai.finance.failover' => ['gemini'],
    ]);

    TransactionExtractor::fake(fn (string $prompt, $attachments, $provider) => $provider->name() === 'openai'
        ? throw new ProviderOverloadedException('overloaded')
        : Captures::extraction(['amount_cents' => 1250]))->preventStrayPrompts();

    $this->post('/api/v1/captures', ['kind' => 'photo', 'file' => Captures::photo()])
        ->assertCreated()
        ->assertJsonPath('data.capture.status', 'completed')
        ->assertJsonPath('data.draft.proposal.amount_cents', 1250);

    TransactionExtractor::assertPrompted(fn (AgentPrompt $prompt): bool => $prompt->provider->name() === 'openai'
        && $prompt->model === 'configured-extraction-model');
    TransactionExtractor::assertPrompted(fn (AgentPrompt $prompt): bool => $prompt->provider->name() === 'gemini');
    expect(Capture::query()->sole()->provider)->toBe('gemini');
});

it('gives the failover provider only the time left before the deadline', function (): void {
    config(['ai.finance.extraction.provider' => 'openai', 'ai.finance.failover' => ['anthropic']]);

    TransactionExtractor::fake(function (string $prompt, $attachments, $provider) {
        if ($provider->name() === 'openai') {
            $this->travel(12)->seconds();

            throw new ProviderConnectionException('Could not connect to AI provider [openai].');
        }

        return Captures::extraction(['amount_cents' => 1250]);
    })->preventStrayPrompts();

    $this->post('/api/v1/captures', ['kind' => 'photo', 'file' => Captures::photo()])
        ->assertCreated()
        ->assertJsonPath('data.capture.status', 'completed')
        ->assertJsonPath('data.draft.proposal.amount_cents', 1250);

    TransactionExtractor::assertPrompted(fn (AgentPrompt $prompt): bool => $prompt->provider->name() === 'openai' && $prompt->timeout === 12);
    TransactionExtractor::assertPrompted(fn (AgentPrompt $prompt): bool => $prompt->provider->name() === 'anthropic' && $prompt->timeout === 3);
    expect(Capture::query()->sole())
        ->provider->toBe('anthropic')
        ->extraction_ms->toBeLessThanOrEqual(15_000);
});

it('skips the failover provider once the primary one has used up the deadline', function (): void {
    config(['ai.finance.extraction.provider' => 'openai', 'ai.finance.failover' => ['anthropic']]);

    TransactionExtractor::fake(function (string $prompt, $attachments, $provider) {
        $this->travel(14_500)->milliseconds();

        throw new ProviderConnectionException('Could not connect to AI provider ['.$provider->name().'].');
    })->preventStrayPrompts();

    $this->post('/api/v1/captures', ['kind' => 'photo', 'file' => Captures::photo()])
        ->assertCreated()
        ->assertJsonPath('data.capture.status', 'failed')
        ->assertJsonPath('data.capture.error', CaptureFailureMessage::TIMED_OUT)
        ->assertJsonPath('data.draft.status', 'pending');

    TransactionExtractor::assertNotPrompted(fn (AgentPrompt $prompt): bool => $prompt->provider->name() === 'anthropic');
    expect(Capture::query()->sole())
        ->provider->toBe('openai')
        ->extraction_ms->toBeLessThanOrEqual(15_000);
});

it('exposes a short single-line error instead of the provider response body', function (Closure $failure, string $message): void {
    TransactionExtractor::fake($failure)->preventStrayPrompts();

    $error = $this->post('/api/v1/captures', ['kind' => 'photo', 'file' => Captures::photo()])
        ->assertCreated()
        ->assertJsonPath('data.capture.status', 'failed')
        ->json('data.capture.error');

    expect($error)->toBe($message)
        ->not->toContain("\n")
        ->not->toContain('{')
        ->not->toContain('Incorrect API key');
})->with([
    'invalid key' => [fn () => fn () => throw new RequestException(new ClientResponse(new Psr7Response(401, ['Content-Type' => 'application/json'], "{\n  \"error\": {\n    \"message\": \"Incorrect API key provided: sk-abc\"\n  }\n}"))), 'El proveedor de IA devolvió un error (HTTP 401).'],
    'connection timeout' => [fn () => fn () => throw new ProviderConnectionException("Could not connect to AI provider [openai].\ncURL error 28"), CaptureFailureMessage::TIMED_OUT],
    'unexpected failure' => [fn () => fn () => throw new RuntimeException("Something\nmulti-line {\"secret\": true}"), CaptureFailureMessage::GENERIC],
    'malformed output' => [fn () => fn () => 'not json at all', 'La IA no devolvió un movimiento reconocible.'],
]);

it('accepts every configured audio format and the iOS container aliases', function (string $name, string $mime, string $stored, string $extension): void {
    Captures::postVoice('Veinte euros', Captures::extraction(), ['file' => Captures::audio($name, $mime)])
        ->assertCreated()
        ->assertJsonPath('data.capture.attachments.0.mime', $stored);

    expect(Attachment::query()->sole()->path)->toEndWith('.'.$extension);
    Transcription::assertGenerated(fn (TranscriptionPrompt $prompt): bool => $prompt->audio->name() === 'audio.'.$extension);
})->with([
    'iOS m4a' => ['nota.m4a', 'audio/mp4', 'audio/mp4', 'm4a'],
    'm4a alias' => ['nota.m4a', 'audio/x-m4a', 'audio/x-m4a', 'm4a'],
    'mp4 container' => ['nota.mp4', 'video/mp4', 'audio/mp4', 'm4a'],
    'aac' => ['nota.aac', 'audio/aac', 'audio/aac', 'aac'],
    'webm' => ['nota.webm', 'audio/webm', 'audio/webm', 'webm'],
    'webm container' => ['nota.webm', 'video/webm', 'audio/webm', 'webm'],
    'ogg' => ['nota.ogg', 'audio/ogg', 'audio/ogg', 'ogg'],
    'mp3' => ['nota.mp3', 'audio/mpeg', 'audio/mpeg', 'mp3'],
    'wav' => ['nota.wav', 'audio/wav', 'audio/wav', 'wav'],
]);

it('rejects invalid uploads with 422 and stores nothing', function (Closure $payload, string $field): void {
    $this->post('/api/v1/captures', $payload())
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);

    expect(Capture::query()->count())->toBe(0)
        ->and(Storage::disk('receipts')->allFiles())->toBe([]);
    Transcription::assertNothingGenerated();
    TransactionExtractor::assertNeverPrompted();
})->with([
    'missing kind' => [fn (): array => ['file' => Captures::audio()], 'kind'],
    'unknown kind' => [fn (): array => ['kind' => 'video', 'file' => Captures::audio()], 'kind'],
    'missing file' => [fn (): array => ['kind' => 'voice'], 'file'],
    'image as voice' => [fn (): array => ['kind' => 'voice', 'file' => Captures::photo()], 'file'],
    'audio as photo' => [fn (): array => ['kind' => 'photo', 'file' => Captures::audio()], 'file'],
    'heic photo' => [fn (): array => ['kind' => 'photo', 'file' => Captures::photo('ticket.heic', 'image/heic')], 'file'],
    'pdf' => [fn (): array => ['kind' => 'photo', 'file' => Captures::photo('ticket.pdf', 'application/pdf')], 'file'],
    'audio over 10 MB' => [fn (): array => ['kind' => 'voice', 'file' => Captures::audio(kilobytes: 10_241)], 'file'],
    'photo over 8 MB' => [fn (): array => ['kind' => 'photo', 'file' => Captures::photo(kilobytes: 8_193)], 'file'],
    'bad client timestamp' => [fn (): array => ['kind' => 'voice', 'file' => Captures::audio(), 'client_started_at' => 'yesterday-ish'], 'client_started_at'],
]);

it('requires authentication', function (): void {
    auth()->forgetGuards();
    $this->app['auth']->guard('web')->logout();

    $this->post('/api/v1/captures', ['kind' => 'voice', 'file' => Captures::audio()])->assertUnauthorized();

    expect(Capture::query()->count())->toBe(0);
});

it('throttles captures per user per hour', function (): void {
    config(['finance.capture.rate_limit_per_hour' => 2]);
    Transcription::fake(['uno', 'dos', 'tres'])->preventStrayTranscriptions();
    TransactionExtractor::fake([Captures::extraction(), Captures::extraction(), Captures::extraction()])->preventStrayPrompts();

    $this->post('/api/v1/captures', ['kind' => 'voice', 'file' => Captures::audio()])->assertCreated();
    $this->post('/api/v1/captures', ['kind' => 'voice', 'file' => Captures::audio()])->assertCreated();
    $this->post('/api/v1/captures', ['kind' => 'voice', 'file' => Captures::audio()])
        ->assertTooManyRequests()
        ->assertHeader('Retry-After');
});

it('removes the stored file when the capture rows cannot be written', function (): void {
    Transcription::fake(['Veinte euros'])->preventStrayTranscriptions();
    TransactionExtractor::fake([Captures::extraction()])->preventStrayPrompts();
    Draft::creating(fn () => throw new RuntimeException('database unavailable'));

    $this->withoutExceptionHandling();

    expect(fn () => $this->post('/api/v1/captures', ['kind' => 'voice', 'file' => Captures::audio()]))
        ->toThrow(RuntimeException::class, 'database unavailable');

    expect(Storage::disk('receipts')->allFiles())->toBe([])
        ->and(Capture::query()->count())->toBe(0)
        ->and(Attachment::query()->count())->toBe(0);
});
