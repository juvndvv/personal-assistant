<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            ALTER TABLE transactions
                ADD COLUMN recurring_occurrence_id bigint NULL
                    CONSTRAINT transactions_recurring_occurrence_unique UNIQUE
                    CONSTRAINT transactions_recurring_occurrence_fk REFERENCES recurring_occurrences (id) ON DELETE SET NULL
            SQL);

        DB::statement(<<<'SQL'
            ALTER TABLE drafts
                ADD COLUMN recurring_occurrence_id bigint NULL
                    CONSTRAINT drafts_recurring_occurrence_unique UNIQUE
                    CONSTRAINT drafts_recurring_occurrence_fk REFERENCES recurring_occurrences (id) ON DELETE CASCADE,
                ADD CONSTRAINT drafts_recurring_origin CHECK ((origin = 'recurring') = (recurring_occurrence_id IS NOT NULL))
            SQL);
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE drafts DROP CONSTRAINT IF EXISTS drafts_recurring_origin');
        DB::statement('ALTER TABLE drafts DROP COLUMN IF EXISTS recurring_occurrence_id');
        DB::statement('ALTER TABLE transactions DROP COLUMN IF EXISTS recurring_occurrence_id');
    }
};
