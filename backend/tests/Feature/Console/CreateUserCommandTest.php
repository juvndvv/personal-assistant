<?php

declare(strict_types=1);

use App\Console\Input\PasswordInput;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

function fakeStdin(?string $line): void
{
    app()->instance(PasswordInput::class, new class($line) implements PasswordInput
    {
        public function __construct(private readonly ?string $line) {}

        public function readLine(): ?string
        {
            return $this->line;
        }
    });
}

it('creates the single user with a hidden password prompt', function (): void {
    $this->artisan('app:create-user', ['email' => 'dani@example.com', '--name' => 'Dani'])
        ->expectsQuestion('Password', 'correct-horse-battery')
        ->expectsQuestion('Confirm password', 'correct-horse-battery')
        ->expectsOutputToContain('User dani@example.com created.')
        ->assertSuccessful();

    $user = User::query()->sole();

    expect($user->name)->toBe('Dani')
        ->and($user->email)->toBe('dani@example.com')
        ->and(Hash::check('correct-horse-battery', $user->password))->toBeTrue();
});

it('derives the name from the email when no name is given', function (): void {
    fakeStdin("correct-horse-battery\n");

    $this->artisan('app:create-user', ['email' => 'dani@example.com', '--password-stdin' => true])
        ->assertSuccessful();

    expect(User::query()->sole()->name)->toBe('Dani');
});

it('reads the password from stdin', function (): void {
    fakeStdin("correct-horse-battery\n");

    $this->artisan('app:create-user', ['email' => 'dani@example.com', '--name' => 'Dani', '--password-stdin' => true])
        ->assertSuccessful();

    expect(Hash::check('correct-horse-battery', User::query()->sole()->password))->toBeTrue();
});

it('fails when stdin is empty', function (): void {
    fakeStdin(null);

    $this->artisan('app:create-user', ['email' => 'dani@example.com', '--password-stdin' => true])
        ->assertFailed();

    expect(User::query()->count())->toBe(0);
});

it('refuses to create a second user', function (): void {
    User::factory()->create();
    fakeStdin("correct-horse-battery\n");

    $this->artisan('app:create-user', ['email' => 'second@example.com', '--password-stdin' => true])
        ->expectsOutputToContain('A user already exists')
        ->assertFailed();

    expect(User::query()->count())->toBe(1);
});

it('rejects a password of 11 characters', function (): void {
    fakeStdin("abcdefghijk\n");

    $this->artisan('app:create-user', ['email' => 'dani@example.com', '--password-stdin' => true])
        ->assertFailed();

    expect(User::query()->count())->toBe(0);
});

it('accepts a password of exactly 12 characters', function (): void {
    fakeStdin("abcdefghijkl\n");

    $this->artisan('app:create-user', ['email' => 'dani@example.com', '--password-stdin' => true])
        ->assertSuccessful();

    expect(Hash::check('abcdefghijkl', User::query()->sole()->password))->toBeTrue();
});

it('rejects an interactive password of 11 characters', function (): void {
    $this->artisan('app:create-user', ['email' => 'dani@example.com'])
        ->expectsQuestion('Password', 'abcdefghijk')
        ->expectsQuestion('Confirm password', 'abcdefghijk')
        ->assertFailed();

    expect(User::query()->count())->toBe(0);
});

it('rejects mismatched password confirmation', function (): void {
    $this->artisan('app:create-user', ['email' => 'dani@example.com'])
        ->expectsQuestion('Password', 'correct-horse-battery')
        ->expectsQuestion('Confirm password', 'another-horse-battery')
        ->assertFailed();

    expect(User::query()->count())->toBe(0);
});

it('rejects an invalid email', function (): void {
    fakeStdin("correct-horse-battery\n");

    $this->artisan('app:create-user', ['email' => 'not-an-email', '--password-stdin' => true])
        ->assertFailed();

    expect(User::query()->count())->toBe(0);
});

it('accepts the with-defaults option', function (): void {
    fakeStdin("correct-horse-battery\n");

    $this->artisan('app:create-user', ['email' => 'dani@example.com', '--password-stdin' => true, '--with-defaults' => true])
        ->assertSuccessful();

    expect(User::query()->count())->toBe(1);
});
