<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Console\Input\PasswordInput;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Symfony\Component\Console\Attribute\AsCommand;

#[AsCommand(name: 'app:create-user')]
final class CreateUser extends Command
{
    protected $signature = 'app:create-user
        {email : Email address used to log in}
        {--name= : Display name (defaults to the email local part)}
        {--password-stdin : Read the password from the first line of standard input}
        {--with-defaults : Seed the default Spanish category tree}';

    protected $description = 'Create the single user of the application';

    public function handle(PasswordInput $passwordInput): int
    {
        if (User::query()->exists()) {
            $this->error('A user already exists. This application supports a single user.');

            return self::FAILURE;
        }

        $email = Str::lower(trim($this->stringArgument('email')));
        $password = $this->option('password-stdin')
            ? $this->passwordFromStdin($passwordInput)
            : $this->passwordFromPrompt();

        if ($password === null) {
            return self::FAILURE;
        }

        $validator = Validator::make(
            ['email' => $email, 'password' => $password],
            ['email' => ['required', 'email', 'max:255'], 'password' => ['required', 'string', 'min:12', 'max:255']],
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        User::query()->create([
            'name' => $this->nameFor($email),
            'email' => $email,
            'password' => $password,
        ]);

        $this->info("User {$email} created.");

        return self::SUCCESS;
    }

    private function passwordFromStdin(PasswordInput $passwordInput): ?string
    {
        $line = $passwordInput->readLine();
        $password = $line === null ? '' : rtrim($line, "\r\n");

        if ($password === '') {
            $this->error('No password received on standard input.');

            return null;
        }

        return $password;
    }

    private function passwordFromPrompt(): ?string
    {
        $password = $this->hiddenAnswer('Password');
        $confirmation = $this->hiddenAnswer('Confirm password');

        if ($password !== $confirmation) {
            $this->error('The passwords do not match.');

            return null;
        }

        return $password;
    }

    private function nameFor(string $email): string
    {
        $name = $this->option('name');

        if (is_string($name) && trim($name) !== '') {
            return trim($name);
        }

        return Str::of($email)->before('@')->replace(['.', '_', '-'], ' ')->title()->toString();
    }

    private function hiddenAnswer(string $question): string
    {
        $answer = $this->secret($question);

        return is_string($answer) ? $answer : '';
    }

    private function stringArgument(string $key): string
    {
        $value = $this->argument($key);

        return is_string($value) ? $value : '';
    }
}
