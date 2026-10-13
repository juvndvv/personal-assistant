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

/**
 * @return list<int>
 */
function providerModelLiteralLines(string $code): array
{
    $lines = [];

    foreach (PhpToken::tokenize($code) as $token) {
        if ($token->id === T_CONSTANT_ENCAPSED_STRING && preg_match('/gpt-|whisper|o4-|claude-|gemini-/i', $token->text) === 1) {
            $lines[] = $token->line;
        }
    }

    return $lines;
}

/**
 * @return list<int>
 */
function unscopedLedgerReadLines(string $code): array
{
    $tokens = PhpToken::tokenize($code);
    $lines = [];

    foreach ($tokens as $index => $token) {
        $isTableLiteral = $token->id === T_CONSTANT_ENCAPSED_STRING
            && preg_match('/^([\'"])transactions\1$|\b(from|join)\s+transactions\b/i', $token->text) === 1;
        $isHeredocTable = $token->id === T_ENCAPSED_AND_WHITESPACE
            && preg_match('/\b(from|join)\s+transactions\b/i', $token->text) === 1;

        $isUnscopedModelCall = false;

        if (in_array($token->id, [T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED], true)
            && preg_match('/(^|\\\\)Transaction$/', $token->text) === 1
            && ($tokens[$index + 1]->id ?? null) === T_DOUBLE_COLON) {
            $isUnscopedModelCall = ($tokens[$index + 2]->text ?? '') !== 'reportable';
        }

        if ($isTableLiteral || $isHeredocTable || $isUnscopedModelCall) {
            $lines[] = $token->line;
        }
    }

    return $lines;
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
        foreach (providerModelLiteralLines((string) file_get_contents($file)) as $line) {
            $violations[] = $file.':'.$line;
        }
    }

    expect($violations)->toBe([]);
});

arch('agents never pin a provider or model with attributes')
    ->expect('App\\Ai')
    ->not->toUse([
        'Laravel\\Ai\\Attributes\\Provider',
        'Laravel\\Ai\\Attributes\\Model',
        'Laravel\\Ai\\Attributes\\UseCheapestModel',
        'Laravel\\Ai\\Attributes\\UseSmartestModel',
    ]);

it('detects provider model literals', function (): void {
    expect(providerModelLiteralLines("<?php\n\$model = 'gpt-6-luna';\n\$stt = \"whisper-1\";\n// gpt-4 in a comment\n"))->toBe([2, 3]);
});

it('reads the ledger in reports only through the reportable scope', function (): void {
    $violations = [];

    foreach (phpFilesIn('app/Reports') as $file) {
        foreach (unscopedLedgerReadLines((string) file_get_contents($file)) as $line) {
            $violations[] = $file.':'.$line;
        }
    }

    expect(phpFilesIn('app/Reports'))->not->toBe([])
        ->and($violations)->toBe([]);
});

it('detects ledger reads that bypass the reportable scope', function (): void {
    $code = <<<'PHP'
        <?php
        Transaction::reportable()->sum('amount_cents');
        Transaction::query()->sum('amount_cents');
        DB::table('transactions')->count();
        DB::select("SELECT 1 FROM transactions");
        DB::select("SELECT 1 FROM accounts JOIN transactions ON true");
        $sql = 'transactions.amount_cents';
        \App\Models\Transaction::withTrashed();
        PHP;

    expect(unscopedLedgerReadLines($code))->toBe([3, 4, 5, 6, 8]);
});

arch('net worth reads balances through the balance calculator, never the ledger')
    ->expect('App\Reports\NetWorthReport')
    ->toUse('App\Domain\Ledger\BalanceCalculator')
    ->not->toUse('App\Models\Transaction');

arch('reports are read-only services outside the HTTP layer')
    ->expect('App\Reports')
    ->not->toUse('App\Http')
    ->not->toUse('App\Actions');
