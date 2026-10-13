<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;

it('installs pg_trgm and unaccent', function (): void {
    $extensions = DB::table('pg_extension')->pluck('extname')->all();

    expect($extensions)->toContain('pg_trgm', 'unaccent');
});

it('provides an immutable f_unaccent wrapper', function (): void {
    $row = DB::selectOne("SELECT public.f_unaccent('Cafetería Ñandú') AS plain");

    expect($row->plain)->toBe('Cafeteria Nandu');

    $volatility = DB::selectOne("SELECT provolatile FROM pg_proc WHERE proname = 'f_unaccent'");

    expect($volatility->provolatile)->toBe('i');
});

it('runs the session in the Europe/Madrid timezone', function (): void {
    expect(DB::selectOne('SHOW TIME ZONE')->TimeZone)->toBe('Europe/Madrid');
});

it('can index with f_unaccent and trigram operators', function (): void {
    DB::statement('CREATE TEMPORARY TABLE unaccent_probe (name text)');
    DB::statement('CREATE INDEX unaccent_probe_trgm ON unaccent_probe USING gin (public.f_unaccent(lower(name)) gin_trgm_ops)');
    DB::table('unaccent_probe')->insert(['name' => 'Panadería']);

    $match = DB::selectOne("SELECT similarity(public.f_unaccent(lower(name)), 'panaderia') AS score FROM unaccent_probe");

    expect((float) $match->score)->toBe(1.0);
});
