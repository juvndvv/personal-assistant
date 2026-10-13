<?php

declare(strict_types=1);

use App\Ai\Agents\TransactionExtractor;
use App\Ai\ExtractionCatalog;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Transcription;

it('throws on an unfaked transcription', function (): void {
    Transcription::fromBase64(base64_encode('fake-audio-bytes'), 'audio/mp4')->generate();
})->throws(RuntimeException::class, 'Attempted transcription generation without a fake response.');

it('throws on an unfaked http request', function (): void {
    Http::get('https://api.openai.com/v1/models');
})->throws(RuntimeException::class);

it('throws on an unfaked extraction prompt', function (): void {
    (new TransactionExtractor(CarbonImmutable::today(), new ExtractionCatalog([], [])))->prompt('Veinte euros');
})->throws(RuntimeException::class, 'without a fake agent response');
