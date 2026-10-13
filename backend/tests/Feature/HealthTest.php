<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;

it('answers the health route when the database is reachable', function (): void {
    $this->get('/up')->assertOk();
});

it('fails the health route when the database is unreachable', function (): void {
    config(['database.connections.health_probe' => [
        ...config()->array('database.connections.pgsql'),
        'host' => '127.0.0.1',
        'port' => 1,
    ]]);
    config(['database.default' => 'health_probe']);
    DB::purge('health_probe');

    $this->get('/up')->assertServerError();
});
