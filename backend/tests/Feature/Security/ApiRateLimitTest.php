<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Testing\TestResponse;

function requestMe(int $times): TestResponse
{
    $response = null;

    foreach (range(1, $times) as $request) {
        $response = test()->getJson('/api/v1/auth/me');
    }

    return $response ?? throw new LogicException('At least one request is required.');
}

it('rejects the 121st api request within a minute', function (): void {
    $this->actingAs(User::factory()->create(), 'web');

    requestMe(120)->assertOk();

    $this->getJson('/api/v1/settings')
        ->assertTooManyRequests()
        ->assertHeader('Retry-After')
        ->assertJsonPath('message', 'Too Many Attempts.');
});

it('allows api requests again after a minute', function (): void {
    $this->actingAs(User::factory()->create(), 'web');

    requestMe(121)->assertTooManyRequests();

    $this->travel(61)->seconds();

    $this->getJson('/api/v1/auth/me')->assertOk();
});

it('keys the api limiter by user', function (): void {
    $this->actingAs(User::factory()->create(), 'web');
    requestMe(121)->assertTooManyRequests();

    app('auth')->forgetGuards();
    $this->actingAs(User::factory()->create(), 'web');

    $this->getJson('/api/v1/auth/me')->assertOk();
});

it('keys the api limiter by ip for guests', function (): void {
    $incompleteLogin = fn (int $attempt, string $ip = '127.0.0.1') => test()
        ->withServerVariables(['REMOTE_ADDR' => $ip])
        ->postJson('/api/v1/auth/login', ['email' => "guest{$attempt}@example.com"]);

    foreach (range(1, 120) as $attempt) {
        $incompleteLogin($attempt)->assertUnprocessable();
    }

    $incompleteLogin(121)->assertTooManyRequests();
    $incompleteLogin(122, '198.51.100.9')->assertUnprocessable();
});

it('does not throttle the health endpoint', function (): void {
    foreach (range(1, 121) as $request) {
        $response = $this->get('/up');
    }

    $response->assertOk();
});

it('defaults the api limit to 120 requests per minute', function (): void {
    expect(config('finance.security.api_rate_limit_per_minute'))->toBe(120);
});

it('applies the configured api limit', function (): void {
    config(['finance.security.api_rate_limit_per_minute' => 3]);
    $this->actingAs(User::factory()->create(), 'web');

    requestMe(3)->assertOk();

    $this->getJson('/api/v1/auth/me')
        ->assertTooManyRequests()
        ->assertHeader('Retry-After');
});

it('falls back to 120 requests per minute when the configured limit is not a positive number', function (mixed $configured): void {
    config(['finance.security.api_rate_limit_per_minute' => $configured]);
    $this->actingAs(User::factory()->create(), 'web');

    requestMe(120)->assertOk();

    $this->getJson('/api/v1/auth/me')->assertTooManyRequests();
})->with([
    'empty string' => '',
    'zero string' => '0',
    'zero' => 0,
    'negative' => -5,
    'not numeric' => 'unlimited',
]);
