<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE settings (
                id smallint PRIMARY KEY DEFAULT 1 CONSTRAINT settings_singleton CHECK (id = 1),
                month_start_day smallint NOT NULL DEFAULT 1
                    CONSTRAINT settings_month_start_day_range CHECK (month_start_day BETWEEN 1 AND 28),
                default_account_id bigint NULL,
                last_used_account_id bigint NULL,
                orphan_draft_ttl_days smallint NOT NULL DEFAULT 7
                    CONSTRAINT settings_orphan_draft_ttl_days_range CHECK (orphan_draft_ttl_days BETWEEN 1 AND 90),
                created_at timestamptz NULL,
                updated_at timestamptz NULL
            )
            SQL);

        DB::statement('INSERT INTO settings (id, created_at, updated_at) VALUES (1, now(), now())');
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS settings');
    }
};
