<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Process;
use Tests\TestCase;

it('runs against the dedicated test database in the testing environment', function (): void {
    expect(config('database.connections.pgsql.database'))->toBe(TestCase::TEST_DATABASE)
        ->and(app()->environment())->toBe('testing');
});

it('ignores development values injected into the process environment', function (): void {
    $result = Process::path(base_path())
        ->env([
            'APP_ENV' => 'local',
            'DB_DATABASE' => 'finance',
            'DB_URL' => 'pgsql://finance:finance@db:5432/finance',
            'SESSION_SECURE_COOKIE' => 'false',
            'AI_EXTRACTION_PROVIDER' => 'anthropic',
            'AI_TRANSCRIPTION_PROVIDER' => 'gemini',
            'AI_TIMEOUT' => '99',
            'AI_FAILOVER' => 'anthropic,gemini',
        ])
        ->timeout(120)
        ->run([PHP_BINARY, 'vendor/bin/pest', 'tests/Unit/ConfigurationTest.php', '--no-coverage']);

    expect($result->exitCode())->toBe(0, $result->output().$result->errorOutput());
});
