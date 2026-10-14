<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;

const HARDENED_PASSWORD = 'correct-horse-battery';

beforeEach(function (): void {
    $this->user = User::factory()->create([
        'email' => 'dani@example.com',
        'password' => Hash::make(HARDENED_PASSWORD),
    ]);
});

function rememberedLoginResponse(): TestResponse
{
    return test()->postJson('/api/v1/auth/login', [
        'email' => 'dani@example.com',
        'password' => HARDENED_PASSWORD,
        'remember' => true,
    ])->assertOk();
}

it('ships hardened session defaults', function (): void {
    $saved = [
        'putenv' => getenv('SESSION_SECURE_COOKIE'),
        'env' => $_ENV['SESSION_SECURE_COOKIE'] ?? null,
        'server' => $_SERVER['SESSION_SECURE_COOKIE'] ?? null,
    ];

    putenv('SESSION_SECURE_COOKIE');
    unset($_ENV['SESSION_SECURE_COOKIE'], $_SERVER['SESSION_SECURE_COOKIE']);

    try {
        $session = require base_path('config/session.php');
    } finally {
        if ($saved['putenv'] !== false) {
            putenv('SESSION_SECURE_COOKIE='.$saved['putenv']);
        }
        if ($saved['env'] !== null) {
            $_ENV['SESSION_SECURE_COOKIE'] = $saved['env'];
        }
        if ($saved['server'] !== null) {
            $_SERVER['SESSION_SECURE_COOKIE'] = $saved['server'];
        }
    }

    expect($session['secure'])->toBeTrue()
        ->and($session['http_only'])->toBeTrue()
        ->and($session['same_site'])->toBe('lax')
        ->and($session['lifetime'])->toBe(43200)
        ->and($session['partitioned'])->toBeFalse();
});

it('keeps the session secure, http-only and same-site lax at runtime', function (): void {
    expect(config('session.secure'))->toBeTrue()
        ->and(config('session.http_only'))->toBeTrue()
        ->and(config('session.same_site'))->toBe('lax');
});

it('issues secure, http-only, same-site lax session and remember cookies on login', function (): void {
    $response = rememberedLoginResponse();

    $session = $response->getCookie((string) config('session.cookie'), decrypt: false);
    $recaller = $response->getCookie(Auth::guard('web')->getRecallerName(), decrypt: false);

    foreach ([$session, $recaller] as $cookie) {
        expect($cookie)->not->toBeNull()
            ->and($cookie?->isSecure())->toBeTrue()
            ->and($cookie?->isHttpOnly())->toBeTrue()
            ->and($cookie?->getSameSite())->toBe('lax');
    }
});

it('rotates the remember token on logout so stolen recaller cookies stop working', function (): void {
    $recaller = (string) rememberedLoginResponse()
        ->getCookie(Auth::guard('web')->getRecallerName(), decrypt: true)
        ?->getValue();
    $tokenAtLogin = $this->user->fresh()?->remember_token;

    $this->postJson('/api/v1/auth/logout')
        ->assertNoContent()
        ->assertCookieExpired(Auth::guard('web')->getRecallerName());

    expect($this->user->fresh()?->remember_token)->not->toBeNull()->not->toBe($tokenAtLogin);

    app('auth')->forgetGuards();
    app()->forgetInstance('session.store');
    app('session')->forgetDrivers();

    $this->withCookies([Auth::guard('web')->getRecallerName() => $recaller])
        ->getJson('/api/v1/auth/me')
        ->assertUnauthorized();
});

it('resolves the client ip through trusted proxies only', function (): void {
    config(['trustedproxy.proxies' => '10.0.0.1']);

    foreach (range(1, 10) as $attempt) {
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.1'])
            ->withHeader('X-Forwarded-For', '203.0.113.7')
            ->postJson('/api/v1/auth/login', ['email' => "intruder{$attempt}@example.com", 'password' => 'wrong-password'])
            ->assertUnprocessable();
    }

    $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.1'])
        ->withHeader('X-Forwarded-For', '203.0.113.7')
        ->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => HARDENED_PASSWORD])
        ->assertForbidden()
        ->assertJsonPath('code', 'ip_blocked');

    $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.1'])
        ->withHeader('X-Forwarded-For', '198.51.100.9')
        ->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => HARDENED_PASSWORD])
        ->assertOk();
});

it('ignores forwarded headers from untrusted clients', function (): void {
    config(['trustedproxy.proxies' => '10.0.0.1']);

    foreach (range(1, 10) as $attempt) {
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])
            ->withHeader('X-Forwarded-For', "198.51.100.{$attempt}")
            ->postJson('/api/v1/auth/login', ['email' => "intruder{$attempt}@example.com", 'password' => 'wrong-password'])
            ->assertUnprocessable();
    }

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])
        ->withHeader('X-Forwarded-For', '198.51.100.200')
        ->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => HARDENED_PASSWORD])
        ->assertForbidden();
});

it('reads trusted proxies from the environment', function (): void {
    $config = fn (): mixed => (require base_path('config/trustedproxy.php'))['proxies'];

    putenv('TRUSTED_PROXIES=100.64.0.0/10,10.0.0.1');
    expect($config())->toBe('100.64.0.0/10,10.0.0.1');

    putenv('TRUSTED_PROXIES=');
    expect($config())->toBeNull();

    putenv('TRUSTED_PROXIES');
});
