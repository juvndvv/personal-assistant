<?php

declare(strict_types=1);

it('requires authentication for every ledger endpoint', function (string $method, string $uri): void {
    $this->json($method, $uri)->assertUnauthorized();
})->with([
    ['GET', '/api/v1/settings'],
    ['PATCH', '/api/v1/settings'],
    ['GET', '/api/v1/periods/current'],
    ['GET', '/api/v1/periods'],
    ['GET', '/api/v1/periods/resolve?date=2026-10-13'],
    ['GET', '/api/v1/accounts'],
    ['POST', '/api/v1/accounts'],
    ['GET', '/api/v1/accounts/1'],
    ['PATCH', '/api/v1/accounts/1'],
    ['DELETE', '/api/v1/accounts/1'],
    ['POST', '/api/v1/accounts/1/archive'],
    ['POST', '/api/v1/accounts/1/unarchive'],
    ['GET', '/api/v1/accounts/1/balance'],
    ['POST', '/api/v1/accounts/1/adjustments'],
    ['GET', '/api/v1/categories'],
    ['POST', '/api/v1/categories'],
    ['PATCH', '/api/v1/categories/1'],
    ['DELETE', '/api/v1/categories/1'],
    ['POST', '/api/v1/categories/1/archive'],
    ['POST', '/api/v1/categories/1/unarchive'],
]);
