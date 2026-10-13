<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE attachments (
                id char(26) PRIMARY KEY,
                capture_id char(26) NULL CONSTRAINT attachments_capture_fk REFERENCES captures (id) ON DELETE SET NULL,
                transaction_id bigint NULL
                    CONSTRAINT attachments_transaction_fk REFERENCES transactions (id) ON DELETE RESTRICT,
                kind varchar(5) NOT NULL CONSTRAINT attachments_kind_check CHECK (kind IN ('audio', 'image')),
                disk varchar(20) NOT NULL,
                path varchar(255) NOT NULL,
                mime varchar(80) NOT NULL,
                size_bytes bigint NOT NULL CONSTRAINT attachments_size_positive CHECK (size_bytes > 0),
                sha256 char(64) NOT NULL,
                original_name varchar(255) NULL,
                created_at timestamptz NULL,
                updated_at timestamptz NULL,
                CONSTRAINT attachments_owner CHECK (capture_id IS NOT NULL OR transaction_id IS NOT NULL),
                CONSTRAINT attachments_disk_path_unique UNIQUE (disk, path)
            )
            SQL);

        DB::statement('CREATE INDEX attachments_transaction_id_index ON attachments (transaction_id)');
        DB::statement('CREATE INDEX attachments_capture_id_index ON attachments (capture_id)');
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS attachments');
    }
};
