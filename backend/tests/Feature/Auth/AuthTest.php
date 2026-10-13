<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;

const VALID_PASSWORD = 'correct-horse-battery';

function sessionCookieFrom(TestResponse $response): string
{
    $cookie = $response->getCookie(sessionCookieName(), decrypt: true);

    expect($cookie)->not->toBeNull();

    return (string) $cookie?->getValue();
}

function sessionCookieName(): string
{
    return (string) config('session.cookie');
}

function recallerCookieName(): string
{
    return Auth::guard('web')->getRecallerName();
}

function useDatabaseSessionsWithCredentials(): void
{
    config(['session.driver' => 'database']);
    test()->withCredentials();
}

function startFreshRequest(): void
{
    app('auth')->forgetGuards();
    app()->forgetInstance('session.store');
    app('session')->forgetDrivers();
}

function loginSession(): string
{
    startFreshRequest();

    return sessionCookieFrom(
        test()->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => VALID_PASSWORD])->assertOk()
    );
}

/**
 * @return array{session: string, recaller: string}
 */
function rememberedLogin(): array
{
    startFreshRequest();

    $response = test()->postJson('/api/v1/auth/login', [
        'email' => 'dani@example.com',
        'password' => VALID_PASSWORD,
        'remember' => true,
    ])->assertOk();

    return [
        'session' => sessionCookieFrom($response),
        'recaller' => (string) $response->getCookie(recallerCookieName(), decrypt: true)?->getValue(),
    ];
}

function getMeWithRecaller(string $recaller): TestResponse
{
    startFreshRequest();

    return test()->withCookies([sessionCookieName() => '', recallerCookieName() => $recaller])->getJson('/api/v1/auth/me');
}

function getMeWith(string $session): TestResponse
{
    startFreshRequest();

    return test()->withCookie(sessionCookieName(), $session)->getJson('/api/v1/auth/me');
}

function changePasswordWith(string $session, string $currentPassword): TestResponse
{
    startFreshRequest();

    return test()->withCookie(sessionCookieName(), $session)->putJson('/api/v1/auth/password', [
        'current_password' => $currentPassword,
        'password' => 'a-brand-new-passphrase',
        'password_confirmation' => 'a-brand-new-passphrase',
    ]);
}

function enforceCsrfInTests(): void
{
    app()->bind(ValidateCsrfToken::class, fn ($app) => new class($app, $app['encrypter']) extends ValidateCsrfToken
    {
        protected function runningUnitTests(): bool
        {
            return false;
        }
    });
}

beforeEach(function (): void {
    $this->user = User::factory()->create([
        'name' => 'Dani',
        'email' => 'dani@example.com',
        'password' => Hash::make(VALID_PASSWORD),
    ]);
});

it('logs in with valid credentials and returns the user', function (): void {
    $this->postJson('/api/v1/auth/login', [
        'email' => 'dani@example.com',
        'password' => VALID_PASSWORD,
    ])
        ->assertOk()
        ->assertExactJson(['data' => ['id' => $this->user->id, 'name' => 'Dani', 'email' => 'dani@example.com']]);

    $this->assertAuthenticatedAs($this->user, 'web');
});

it('regenerates the session on login', function (): void {
    $guestSession = sessionCookieFrom($this->getJson('/api/v1/auth/me')->assertUnauthorized());

    $response = $this->withCookie(sessionCookieName(), $guestSession)
        ->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => VALID_PASSWORD])
        ->assertOk();

    expect(sessionCookieFrom($response))->not->toBe($guestSession);
});

it('rejects a wrong password with a generic 422', function (): void {
    $this->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => 'wrong-password'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.email.0', 'Credenciales incorrectas');

    $this->assertGuest('web');
});

it('rejects an unknown email with the same 422 message', function (): void {
    $this->postJson('/api/v1/auth/login', ['email' => 'nobody@example.com', 'password' => VALID_PASSWORD])
        ->assertUnprocessable()
        ->assertJsonPath('errors.email.0', 'Credenciales incorrectas');
});

it('validates the login payload', function (): void {
    $this->postJson('/api/v1/auth/login', [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email', 'password']);
});

it('throttles the sixth failed login within a minute', function (): void {
    foreach (range(1, 5) as $attempt) {
        $this->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => 'wrong-password'])
            ->assertUnprocessable();
    }

    $this->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => 'wrong-password'])
        ->assertTooManyRequests()
        ->assertHeader('Retry-After')
        ->assertJsonPath('message', 'Too Many Attempts.');
});

it('keys the login limiter by email and ip', function (): void {
    foreach (range(1, 5) as $attempt) {
        $this->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => 'wrong-password']);
    }

    $this->postJson('/api/v1/auth/login', ['email' => 'other@example.com', 'password' => 'wrong-password'])
        ->assertUnprocessable();

    $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.2'])
        ->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => VALID_PASSWORD])
        ->assertOk();
});

it('returns 401 from me for guests', function (): void {
    $this->getJson('/api/v1/auth/me')
        ->assertUnauthorized()
        ->assertExactJson(['message' => 'Unauthenticated.']);
});

it('returns the authenticated user from me', function (): void {
    $this->actingAs($this->user, 'web')
        ->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertExactJson(['data' => ['id' => $this->user->id, 'name' => 'Dani', 'email' => 'dani@example.com']]);
});

it('keeps the session across requests and invalidates it on logout', function (): void {
    useDatabaseSessionsWithCredentials();
    $session = loginSession();

    getMeWith($session)->assertOk();

    startFreshRequest();
    $this->withCookie(sessionCookieName(), $session)->postJson('/api/v1/auth/logout')->assertNoContent();

    getMeWith($session)->assertUnauthorized();
});

it('rejects requests whose session cookie is unknown to the server', function (): void {
    useDatabaseSessionsWithCredentials();
    loginSession();

    getMeWith('not-a-real-session-id-000000000000000000')->assertUnauthorized();
});

it('requires authentication to log out', function (): void {
    $this->postJson('/api/v1/auth/logout')->assertUnauthorized();
});

it('sets the remember cookie when remember is true', function (): void {
    $this->postJson('/api/v1/auth/login', [
        'email' => 'dani@example.com',
        'password' => VALID_PASSWORD,
        'remember' => true,
    ])
        ->assertOk()
        ->assertCookie(recallerCookieName());

    expect($this->user->fresh()?->remember_token)->not->toBeNull();
});

it('does not set the remember cookie by default', function (): void {
    $this->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => VALID_PASSWORD])
        ->assertOk()
        ->assertCookieMissing(recallerCookieName());
});

it('clears the remember cookie on logout', function (): void {
    $this->actingAs($this->user, 'web')
        ->postJson('/api/v1/auth/logout')
        ->assertNoContent()
        ->assertCookieExpired(recallerCookieName());
});

it('changes the password with the current password', function (): void {
    $this->actingAs($this->user, 'web')
        ->putJson('/api/v1/auth/password', [
            'current_password' => VALID_PASSWORD,
            'password' => 'a-brand-new-passphrase',
            'password_confirmation' => 'a-brand-new-passphrase',
        ])
        ->assertNoContent();

    expect(Hash::check('a-brand-new-passphrase', (string) $this->user->fresh()?->password))->toBeTrue();
});

it('rejects a password change with a wrong current password', function (): void {
    $this->actingAs($this->user, 'web')
        ->putJson('/api/v1/auth/password', [
            'current_password' => 'not-the-password',
            'password' => 'a-brand-new-passphrase',
            'password_confirmation' => 'a-brand-new-passphrase',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['current_password']);
});

it('rejects a new password of 11 characters', function (): void {
    $this->actingAs($this->user, 'web')
        ->putJson('/api/v1/auth/password', [
            'current_password' => VALID_PASSWORD,
            'password' => 'abcdefghijk',
            'password_confirmation' => 'abcdefghijk',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['password']);

    expect(Hash::check(VALID_PASSWORD, (string) $this->user->fresh()?->password))->toBeTrue();
});

it('accepts a new password of exactly 12 characters', function (): void {
    $this->actingAs($this->user, 'web')
        ->putJson('/api/v1/auth/password', [
            'current_password' => VALID_PASSWORD,
            'password' => 'abcdefghijkl',
            'password_confirmation' => 'abcdefghijkl',
        ])
        ->assertNoContent();

    expect(Hash::check('abcdefghijkl', (string) $this->user->fresh()?->password))->toBeTrue();
});

it('rejects an unconfirmed new password', function (): void {
    $this->actingAs($this->user, 'web')
        ->putJson('/api/v1/auth/password', [
            'current_password' => VALID_PASSWORD,
            'password' => 'a-brand-new-passphrase',
            'password_confirmation' => 'another-new-passphrase',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['password']);
});

it('logs out other sessions and keeps the current one after a password change', function (): void {
    useDatabaseSessionsWithCredentials();
    $current = loginSession();
    $other = loginSession();

    expect($current)->not->toBe($other);

    getMeWith($current)->assertOk();
    getMeWith($other)->assertOk();

    $regenerated = sessionCookieFrom(changePasswordWith($current, VALID_PASSWORD)->assertNoContent());

    expect($regenerated)->not->toBe($current);

    getMeWith($regenerated)->assertOk();
    getMeWith($current)->assertUnauthorized();
    getMeWith($other)->assertUnauthorized();
});

it('renews the remember cookie of the current device and revokes the others after a password change', function (): void {
    useDatabaseSessionsWithCredentials();
    $current = rememberedLogin();
    $other = rememberedLogin();

    startFreshRequest();
    $response = $this->withCookies([sessionCookieName() => $current['session'], recallerCookieName() => $current['recaller']])
        ->putJson('/api/v1/auth/password', [
            'current_password' => VALID_PASSWORD,
            'password' => 'a-brand-new-passphrase',
            'password_confirmation' => 'a-brand-new-passphrase',
        ])
        ->assertNoContent()
        ->assertCookie(recallerCookieName());

    $renewedRecaller = (string) $response->getCookie(recallerCookieName(), decrypt: true)?->getValue();

    expect($renewedRecaller)->not->toBe($current['recaller']);

    getMeWithRecaller($renewedRecaller)->assertOk();
    getMeWithRecaller($current['recaller'])->assertUnauthorized();
    getMeWithRecaller($other['recaller'])->assertUnauthorized();
});

it('throttles the sixth wrong current password within a minute', function (): void {
    $this->actingAs($this->user, 'web');

    foreach (range(1, 5) as $attempt) {
        $this->putJson('/api/v1/auth/password', [
            'current_password' => 'not-the-password',
            'password' => 'a-brand-new-passphrase',
            'password_confirmation' => 'a-brand-new-passphrase',
        ])->assertUnprocessable();
    }

    $this->putJson('/api/v1/auth/password', [
        'current_password' => VALID_PASSWORD,
        'password' => 'a-brand-new-passphrase',
        'password_confirmation' => 'a-brand-new-passphrase',
    ])
        ->assertTooManyRequests()
        ->assertHeader('Retry-After');

    expect(Hash::check(VALID_PASSWORD, (string) $this->user->fresh()?->password))->toBeTrue();
});

it('keys the password limiter by user and ip', function (): void {
    $this->actingAs($this->user, 'web');

    foreach (range(1, 5) as $attempt) {
        $this->putJson('/api/v1/auth/password', ['current_password' => 'not-the-password']);
    }

    $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.2'])
        ->putJson('/api/v1/auth/password', ['current_password' => 'not-the-password'])
        ->assertUnprocessable();

    $otherUser = User::factory()->create();
    startFreshRequest();
    $this->actingAs($otherUser, 'web')
        ->putJson('/api/v1/auth/password', ['current_password' => 'not-the-password'])
        ->assertUnprocessable();
});

it('requires authentication to change the password', function (): void {
    $this->putJson('/api/v1/auth/password', [])->assertUnauthorized();
});

it('has no register endpoint', function (): void {
    $this->postJson('/api/v1/auth/register', [
        'name' => 'Intruder',
        'email' => 'intruder@example.com',
        'password' => VALID_PASSWORD,
    ])->assertNotFound();

    $this->getJson('/api/v1/auth/register')->assertNotFound();
});

it('treats requests from the same host as stateful', function (): void {
    $this->withHeaders(['Referer' => 'https://finanzas.tailnet.example/'])
        ->postJson('https://finanzas.tailnet.example/api/v1/auth/login', [
            'email' => 'dani@example.com',
            'password' => VALID_PASSWORD,
        ])
        ->assertOk();
});

it('serves the csrf cookie endpoint', function (): void {
    $this->get('/sanctum/csrf-cookie')
        ->assertNoContent()
        ->assertCookie('XSRF-TOKEN');
});

it('refuses a login without a stateful session instead of failing', function (): void {
    $this->withoutHeader('Referer')
        ->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => VALID_PASSWORD])
        ->assertStatus(419)
        ->assertJsonPath('message', 'Session required.');

    $this->assertGuest('web');
});

it('ignores bearer tokens on authenticated routes', function (): void {
    $this->withToken('1|abc')
        ->getJson('/api/v1/auth/me')
        ->assertUnauthorized()
        ->assertExactJson(['message' => 'Unauthenticated.']);
});

it('validates a non-scalar email without failing the login limiter', function (): void {
    $this->postJson('/api/v1/auth/login', ['email' => ['a'], 'password' => 'x'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email']);
});

it('answers guests with a json 401 on api routes without an accept header', function (): void {
    $this->withoutHeader('Accept')
        ->get('/api/v1/auth/me')
        ->assertUnauthorized()
        ->assertExactJson(['message' => 'Unauthenticated.']);
});

it('rejects a stateful login without a csrf token', function (): void {
    enforceCsrfInTests();
    $csrf = $this->get('/sanctum/csrf-cookie')->assertNoContent();

    $this->withCookie(sessionCookieName(), sessionCookieFrom($csrf))
        ->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => VALID_PASSWORD])
        ->assertStatus(419);

    $this->assertGuest('web');
});

it('rejects a cross-site logout without a csrf token', function (): void {
    enforceCsrfInTests();

    $this->actingAs($this->user, 'web')
        ->withHeader('Sec-Fetch-Site', 'cross-site')
        ->postJson('/api/v1/auth/logout')
        ->assertStatus(419);
});

it('accepts a stateful login with the xsrf token from the csrf cookie', function (): void {
    enforceCsrfInTests();
    $csrf = $this->get('/sanctum/csrf-cookie')->assertNoContent();
    $xsrfToken = (string) $csrf->getCookie('XSRF-TOKEN', decrypt: false)?->getValue();

    expect($xsrfToken)->not->toBe('');

    $this->withCookie(sessionCookieName(), sessionCookieFrom($csrf))
        ->withHeader('X-XSRF-TOKEN', $xsrfToken)
        ->postJson('/api/v1/auth/login', ['email' => 'dani@example.com', 'password' => VALID_PASSWORD])
        ->assertOk();

    $this->assertAuthenticatedAs($this->user, 'web');
});
