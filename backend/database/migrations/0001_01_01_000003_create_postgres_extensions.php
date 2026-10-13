<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        DB::statement('CREATE EXTENSION IF NOT EXISTS unaccent');
        DB::statement(<<<'SQL'
            CREATE OR REPLACE FUNCTION public.f_unaccent(text)
            RETURNS text
            LANGUAGE sql
            IMMUTABLE PARALLEL SAFE STRICT
            AS $$ SELECT public.unaccent('public.unaccent', $1) $$
            SQL);
    }

    public function down(): void
    {
        DB::statement('DROP FUNCTION IF EXISTS public.f_unaccent(text)');
        DB::statement('DROP EXTENSION IF EXISTS unaccent');
        DB::statement('DROP EXTENSION IF EXISTS pg_trgm');
    }
};
