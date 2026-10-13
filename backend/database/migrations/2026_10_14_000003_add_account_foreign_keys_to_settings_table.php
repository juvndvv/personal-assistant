<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            ALTER TABLE settings
                ADD CONSTRAINT settings_default_account_fk
                    FOREIGN KEY (default_account_id) REFERENCES accounts (id) ON DELETE SET NULL,
                ADD CONSTRAINT settings_last_used_account_fk
                    FOREIGN KEY (last_used_account_id) REFERENCES accounts (id) ON DELETE SET NULL
            SQL);
    }

    public function down(): void
    {
        DB::statement(<<<'SQL'
            ALTER TABLE settings
                DROP CONSTRAINT IF EXISTS settings_default_account_fk,
                DROP CONSTRAINT IF EXISTS settings_last_used_account_fk
            SQL);
    }
};
