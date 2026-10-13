<?php

declare(strict_types=1);

use Symfony\Component\Finder\Finder;

/**
 * @return list<string>
 */
function phpFilesIn(string ...$directories): array
{
    $existing = array_values(array_filter(
        array_map(fn (string $directory): string => dirname(__DIR__, 2).'/'.$directory, $directories),
        is_dir(...),
    ));

    if ($existing === []) {
        return [];
    }

    $files = [];

    foreach (Finder::create()->files()->name('*.php')->in($existing) as $file) {
        $files[] = $file->getRealPath();
    }

    return $files;
}

/**
 * @return list<string>
 */
function floatTypeDeclarationsIn(string $path): array
{
    $tokens = PhpToken::tokenize((string) file_get_contents($path));
    $violations = [];

    foreach ($tokens as $index => $token) {
        if ($token->id !== T_STRING || strtolower($token->text) !== 'float') {
            continue;
        }

        $previous = $index - 1;

        while ($previous >= 0 && $tokens[$previous]->isIgnorable()) {
            $previous--;
        }

        $isFunctionCall = false;
        $next = $index + 1;

        while (isset($tokens[$next]) && $tokens[$next]->isIgnorable()) {
            $next++;
        }

        if (isset($tokens[$next]) && $tokens[$next]->text === '(') {
            $isFunctionCall = true;
        }

        $isMemberAccess = $previous >= 0 && in_array($tokens[$previous]->id, [T_OBJECT_OPERATOR, T_NULLSAFE_OBJECT_OPERATOR, T_DOUBLE_COLON], true);

        if (! $isFunctionCall && ! $isMemberAccess) {
            $violations[] = $path.':'.$token->line;
        }
    }

    return $violations;
}

arch('every file declares strict types')
    ->expect('App')
    ->toUseStrictTypes();

arch('debugging helpers are never shipped')
    ->expect(['dd', 'dump', 'ray', 'var_dump', 'print_r', 'die', 'ddd'])
    ->not->toBeUsed();

arch('the AI SDK is only used inside App\Ai')
    ->expect('App')
    ->not->toUse('Laravel\Ai')
    ->ignoring('App\Ai');

arch('controllers never use the DB facade')
    ->expect('App\Http\Controllers')
    ->not->toUse(['Illuminate\Support\Facades\DB', 'DB']);

arch('mockery is only used in tests')
    ->expect('App')
    ->not->toUse('Mockery');

arch('application code does not depend on test code')
    ->expect('App')
    ->not->toUse('Tests');

arch('actions are final use cases with a handle method')
    ->expect('App\Actions')
    ->classes()
    ->toBeFinal()
    ->toHaveMethod('handle');

arch('enums are string backed')
    ->expect('App\Enums')
    ->toBeStringBackedEnums();

arch('domain code does not depend on the HTTP layer')
    ->expect('App\Domain')
    ->not->toUse('App\Http');

arch('domain conflicts are exceptions')
    ->expect('App\Exceptions\DomainConflict')
    ->toExtend(RuntimeException::class)
    ->toBeFinal();

it('never declares float types in money-handling code', function (): void {
    $violations = [];

    foreach (phpFilesIn('app/Actions', 'app/Domain', 'app/Reports', 'app/Support/Money') as $file) {
        array_push($violations, ...floatTypeDeclarationsIn($file));
    }

    expect($violations)->toBe([]);
});

it('detects float type declarations', function (): void {
    $probe = tempnam(sys_get_temp_dir(), 'float-probe');
    file_put_contents($probe, '<?php function total(float $amount): ?float { return floatval($amount); }');

    expect(floatTypeDeclarationsIn((string) $probe))->toHaveCount(2);

    unlink((string) $probe);
});

it('never hardcodes AI provider model names in application code', function (): void {
    $violations = [];

    foreach (phpFilesIn('app') as $file) {
        foreach (PhpToken::tokenize((string) file_get_contents($file)) as $token) {
            if ($token->id === T_CONSTANT_ENCAPSED_STRING && preg_match('/gpt-|whisper|o4-|claude-|gemini-/i', $token->text) === 1) {
                $violations[] = $file.':'.$token->line;
            }
        }
    }

    expect($violations)->toBe([]);
});
