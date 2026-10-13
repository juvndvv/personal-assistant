<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE captures (
                id char(26) PRIMARY KEY,
                kind varchar(5) NOT NULL CONSTRAINT captures_kind_check CHECK (kind IN ('voice', 'photo')),
                status varchar(10) NOT NULL DEFAULT 'processing'
                    CONSTRAINT captures_status_check CHECK (status IN ('processing', 'completed', 'failed')),
                transcript text NULL,
                raw_extraction jsonb NULL,
                error text NULL,
                provider varchar(40) NULL,
                model varchar(80) NULL,
                transcription_ms integer NULL,
                extraction_ms integer NULL,
                client_started_at timestamptz NULL,
                created_at timestamptz NULL,
                updated_at timestamptz NULL,
                CONSTRAINT captures_transcript_voice_only CHECK (kind = 'voice' OR transcript IS NULL)
            )
            SQL);
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS captures');
    }
};
