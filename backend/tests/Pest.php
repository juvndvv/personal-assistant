<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Transcription;
use Tests\TestCase;

pest()->extend(TestCase::class)
    ->beforeEach(function (): void {
        Http::preventStrayRequests();
        Transcription::fake()->preventStrayTranscriptions();
    })
    ->in('Feature', 'Database', 'Unit');

pest()->use(LazilyRefreshDatabase::class)
    ->afterEach(function (): void {
        if (DB::connection()->transactionLevel() > 0) {
            DB::statement('SET CONSTRAINTS ALL IMMEDIATE');
        }
    })
    ->in('Feature', 'Database');
