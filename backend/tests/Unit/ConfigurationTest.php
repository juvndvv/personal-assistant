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

it('maps the AI environment variables into the finance section', function (): void {
    $variables = [
        'AI_EXTRACTION_PROVIDER' => 'openai-compatible',
        'AI_EXTRACTION_MODEL' => 'local-vision-model',
        'AI_TRANSCRIPTION_PROVIDER' => 'groq',
        'AI_TRANSCRIPTION_MODEL' => 'local-stt-model',
        'AI_TIMEOUT' => '8',
        'AI_FAILOVER' => 'anthropic, gemini',
    ];
    $previous = [];

    foreach ($variables as $name => $value) {
        $previous[$name] = getenv($name);
        putenv("{$name}={$value}");
        $_ENV[$name] = $_SERVER[$name] = $value;
    }

    try {
        $config = require config_path('ai.php');
    } finally {
        foreach ($previous as $name => $value) {
            putenv($value === false ? $name : "{$name}={$value}");
            $_ENV[$name] = $_SERVER[$name] = $value === false ? null : $value;
        }
    }

    expect($config['finance'])->toBe([
        'extraction' => ['provider' => 'openai-compatible', 'model' => 'local-vision-model'],
        'transcription' => ['provider' => 'groq', 'model' => 'local-stt-model'],
        'timeout_seconds' => 8,
        'failover' => ['anthropic', 'gemini'],
    ])
        ->and($config['default'])->toBe('openai-compatible')
        ->and($config['default_for_transcription'])->toBe('groq');
});

it('leaves the models to the provider defaults when the variables are empty', function (): void {
    expect(config('ai.finance.extraction.model'))->toBeNull()
        ->and(config('ai.finance.transcription.model'))->toBeNull();
});

it('defines the capture limits and the private receipts disk', function (): void {
    expect(config('finance.capture'))->toMatchArray([
        'audio_mimes' => ['audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav'],
        'image_mimes' => ['image/jpeg', 'image/png', 'image/webp'],
        'max_audio_kb' => 10240,
        'max_image_kb' => 8192,
        'deadline_seconds' => 15,
        'low_confidence_threshold' => 0.7,
    ])
        ->and(config('filesystems.disks.receipts'))->toMatchArray([
            'driver' => 'local',
            'root' => storage_path('app/private/receipts'),
            'visibility' => 'private',
            'serve' => false,
        ]);
});
