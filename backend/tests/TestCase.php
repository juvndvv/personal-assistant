<?php

declare(strict_types=1);

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    public const string TEST_DATABASE = 'finance_test';

    protected function setUp(): void
    {
        parent::setUp();

        $this->withHeaders([
            'Accept' => 'application/json',
            'Referer' => 'https://localhost/',
        ]);
    }

    protected function refreshApplication(): void
    {
        parent::refreshApplication();

        $this->ensureHermeticEnvironment();
    }

    private function ensureHermeticEnvironment(): void
    {
        $database = config('database.connections.pgsql.database');
        $environment = $this->app?->environment();

        if ($database !== self::TEST_DATABASE || $environment !== 'testing') {
            throw new RuntimeException(sprintf(
                'Refusing to run tests against database "%s" in environment "%s"; expected "%s" in "testing".',
                is_string($database) ? $database : get_debug_type($database),
                is_string($environment) ? $environment : get_debug_type($environment),
                self::TEST_DATABASE,
            ));
        }
    }
}
