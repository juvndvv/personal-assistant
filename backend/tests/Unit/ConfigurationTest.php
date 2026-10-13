<?php

declare(strict_types=1);

it('runs in the Europe/Madrid timezone with a Spanish locale', function (): void {
    expect(config('app.timezone'))->toBe('Europe/Madrid')
        ->and(date_default_timezone_get())->toBe('Europe/Madrid')
        ->and(app()->getLocale())->toBe('es')
        ->and(config('database.connections.pgsql.timezone'))->toBe('Europe/Madrid');
});

it('keeps the session for thirty days in a secure lax cookie', function (): void {
    expect(config('session.lifetime'))->toBe(43200)
        ->and(config('session.secure'))->toBeTrue()
        ->and(config('session.same_site'))->toBe('lax')
        ->and(config('session.http_only'))->toBeTrue();
});

it('reads the ai provider settings from configuration only', function (): void {
    expect(config('ai.finance.extraction.provider'))->toBe('openai')
        ->and(config('ai.finance.transcription.provider'))->toBe('openai')
        ->and(config('ai.finance.timeout_seconds'))->toBe(12)
        ->and(config('ai.finance.failover'))->toBe([]);
});
