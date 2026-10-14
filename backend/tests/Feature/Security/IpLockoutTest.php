<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Testing\TestResponse;

const LOCKOUT_PASSWORD = 'correct-horse-battery';

beforeEach(function (): void {
    $this->user = User::factory()->create([
        'email' => 'dani@example.com',
        'password' => Hash::make(LOCKOUT_PASSWORD),
    ]);
});

function failLoginFrom(string $ip, int $attempt): TestResponse
{
    return test()->withServerVariables(['REMOTE_ADDR' => $ip])
        ->postJson('/api/v1/auth/login', ['email' => "intruder{$attempt}@example.com", 'password' => 'wrong-password']);
}

function failLoginsFrom(string $ip, int $times): void
{
    foreach (range(1, $times) as $attempt) {
        failLoginFrom($ip, $attempt)->assertUnprocessable();
    }
}

function validLoginFrom(string $ip): TestResponse
{
    app('auth')->forgetGuards();

    return test()->withServerVariables(['REMOTE_ADDR' => $ip])
        ->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => LOCKOUT_PASSWORD]);
}

it('blocks an ip for an hour after 10 failed logins within 15 minutes', function (): void {
    $this->freezeTime();

    failLoginsFrom('203.0.113.7', 10);

    validLoginFrom('203.0.113.7')
        ->assertForbidden()
        ->assertJsonPath('code', 'ip_blocked')
        ->assertJsonStructure(['message', 'code'])
        ->assertHeader('Retry-After', '3600');

    $this->assertGuest('web');
});

it('blocks every auth endpoint for the locked ip', function (): void {
    failLoginsFrom('203.0.113.7', 10);

    $this->actingAs($this->user, 'web')
        ->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])
        ->getJson('/api/v1/auth/me')
        ->assertForbidden()
        ->assertJsonPath('code', 'ip_blocked');
});

it('blocks guest auth requests from the locked ip before authentication', function (string $method, string $uri): void {
    failLoginsFrom('203.0.113.7', 10);

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])
        ->json($method, $uri)
        ->assertForbidden()
        ->assertJsonPath('code', 'ip_blocked')
        ->assertHeader('Retry-After');
})->with([
    'me' => ['GET', '/api/v1/auth/me'],
    'logout' => ['POST', '/api/v1/auth/logout'],
    'password' => ['PUT', '/api/v1/auth/password'],
]);

it('does not block other ips', function (): void {
    failLoginsFrom('203.0.113.7', 10);

    validLoginFrom('198.51.100.9')->assertOk();
});

it('keeps the block for the whole hour and lifts it afterwards', function (): void {
    $this->freezeTime();

    failLoginsFrom('203.0.113.7', 10);

    $this->travel(59)->minutes();
    validLoginFrom('203.0.113.7')
        ->assertForbidden()
        ->assertHeader('Retry-After', '60');

    $this->travel(2)->minutes();
    validLoginFrom('203.0.113.7')->assertOk();
});

it('does not block when the failures are spread over more than 15 minutes', function (): void {
    failLoginsFrom('203.0.113.7', 9);

    $this->travel(16)->minutes();
    failLoginFrom('203.0.113.7', 10)->assertUnprocessable();

    validLoginFrom('203.0.113.7')->assertOk();
});

it('blocks when the tenth failure lands inside the 15 minute window', function (): void {
    failLoginsFrom('203.0.113.7', 9);

    $this->travel(14)->minutes();
    failLoginFrom('203.0.113.7', 10)->assertUnprocessable();

    validLoginFrom('203.0.113.7')
        ->assertForbidden()
        ->assertJsonPath('code', 'ip_blocked');
});

it('allows nine failures and a successful login', function (): void {
    failLoginsFrom('203.0.113.7', 9);

    validLoginFrom('203.0.113.7')->assertOk();
});

it('resets the failure counter after a successful login', function (): void {
    failLoginsFrom('203.0.113.7', 9);
    validLoginFrom('203.0.113.7')->assertOk();

    failLoginsFrom('203.0.113.7', 9);
    validLoginFrom('203.0.113.7')->assertOk();
});

it('ignores invalid payloads when counting failures', function (): void {
    foreach (range(1, 12) as $attempt) {
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])
            ->postJson('/api/v1/auth/login', ['email' => "intruder{$attempt}@example.com"])
            ->assertUnprocessable();
    }

    validLoginFrom('203.0.113.7')->assertOk();
});

it('keeps the failed login counter in the database cache store', function (): void {
    failLoginsFrom('203.0.113.7', 3);

    expect(DB::table('cache')->where('key', 'like', '%login-failures%')->count())->toBe(1);
});

it('logs failed logins and lockouts as warnings', function (): void {
    Log::spy();

    failLoginsFrom('203.0.113.7', 10);

    Log::shouldHaveReceived('warning')
        ->with('auth.failed', Mockery::on(fn (array $context): bool => $context['ip'] === '203.0.113.7'))
        ->times(10);
    Log::shouldHaveReceived('warning')
        ->with('auth.lockout', Mockery::on(fn (array $context): bool => $context['ip'] === '203.0.113.7' && $context['minutes'] === 60))
        ->once();
});
