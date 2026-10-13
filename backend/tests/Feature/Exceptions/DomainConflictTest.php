<?php

declare(strict_types=1);

use App\Exceptions\DomainConflict;
use Illuminate\Support\Facades\Route;

it('renders a domain conflict as a 409 with message and code', function (): void {
    Route::get('/api/v1/_test/conflict', fn () => throw new DomainConflict('some_code', 'msg'));

    $this->getJson('/api/v1/_test/conflict')
        ->assertConflict()
        ->assertExactJson(['message' => 'msg', 'code' => 'some_code']);
});

it('renders a domain conflict as json even without an accept header', function (): void {
    Route::get('/api/v1/_test/conflict', fn () => throw new DomainConflict('some_code', 'msg'));

    $this->withoutHeader('Accept')
        ->get('/api/v1/_test/conflict')
        ->assertConflict()
        ->assertExactJson(['message' => 'msg', 'code' => 'some_code']);
});
