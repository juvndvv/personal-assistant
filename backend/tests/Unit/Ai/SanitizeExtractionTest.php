<?php

declare(strict_types=1);

use App\Ai\DraftProposal;
use App\Ai\ExtractionCatalog;
use App\Ai\ExtractionResult;
use App\Ai\SanitizeExtraction;

const SANITIZE_TODAY = '2026-10-13';
const SANITIZE_DEFAULT_ACCOUNT = 3;
const SANITIZE_VISA = 7;
const SANITIZE_SAVINGS = 9;
const SANITIZE_GROCERIES = 11;
const SANITIZE_SALARY = 50;

function sanitizerCatalog(): ExtractionCatalog
{
    return new ExtractionCatalog(
        accounts: [
            ['id' => SANITIZE_DEFAULT_ACCOUNT, 'name' => 'BBVA', 'type' => 'checking'],
            ['id' => SANITIZE_VISA, 'name' => 'Visa', 'type' => 'credit_card'],
            ['id' => SANITIZE_SAVINGS, 'name' => 'Ahorro', 'type' => 'savings_investment'],
        ],
        categories: [
            ['id' => 10, 'name' => 'Alimentación', 'kind' => 'expense', 'parent' => null],
            ['id' => SANITIZE_GROCERIES, 'name' => 'Supermercado', 'kind' => 'expense', 'parent' => 'Alimentación'],
            ['id' => SANITIZE_SALARY, 'name' => 'Nómina', 'kind' => 'income', 'parent' => null],
        ],
    );
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function sanitizerExtraction(array $overrides = []): array
{
    return array_replace_recursive([
        'type' => 'expense',
        'amount_cents' => 2000,
        'date' => '2026-10-12',
        'description' => 'Compra semanal',
        'merchant' => 'Mercadona',
        'category_id' => SANITIZE_GROCERIES,
        'account_id' => SANITIZE_VISA,
        'to_account_id' => null,
        'confidence' => [
            'type' => 0.95, 'amount_cents' => 0.98, 'date' => 0.9, 'description' => 0.9,
            'merchant' => 0.9, 'category_id' => 0.85, 'account_id' => 0.9, 'to_account_id' => 0.0,
        ],
    ], $overrides);
}

/**
 * @param  array<string, mixed>|null  $raw
 */
function sanitizeWith(?array $raw, ?string $transcript = null, ?int $defaultAccountId = SANITIZE_DEFAULT_ACCOUNT): DraftProposal
{
    $result = new ExtractionResult(
        successful: $raw !== null,
        transcript: $transcript,
        extraction: $raw,
        error: $raw === null ? 'Provider unavailable' : null,
        provider: 'openai',
        model: null,
        transcriptionMs: null,
        totalMs: 100,
    );

    return (new SanitizeExtraction)->handle($result, sanitizerCatalog(), day(SANITIZE_TODAY), $defaultAccountId);
}

it('keeps a clean high-confidence extraction as proposed by the model', function (): void {
    $proposal = sanitizeWith(sanitizerExtraction());

    expect($proposal->values)->toBe([
        'type' => 'expense',
        'amount_cents' => 2000,
        'date' => '2026-10-12',
        'account_id' => SANITIZE_VISA,
        'to_account_id' => null,
        'category_id' => SANITIZE_GROCERIES,
        'description' => 'Compra semanal',
        'merchant' => 'Mercadona',
    ])
        ->and($proposal->lowConfidenceFields)->toBe([])
        ->and($proposal->fieldSources)->toMatchArray(['type' => 'ai', 'amount_cents' => 'ai', 'account_id' => 'ai', 'category_id' => 'ai'])
        ->and($proposal->confidence['amount_cents'])->toBe(0.98);
});

it('nulls unknown ids with zero confidence', function (string $field, mixed $value): void {
    $proposal = sanitizeWith(sanitizerExtraction([$field => $value]));

    expect($proposal->values[$field])->toBeNull()
        ->and($proposal->confidence[$field])->toBe(0.0)
        ->and($proposal->lowConfidenceFields)->toContain($field);
})->with([
    'unknown category' => ['category_id', 999],
    'category of the other kind' => ['category_id', SANITIZE_SALARY],
]);

it('falls back to the default account, flagged, when the account is unknown or missing', function (mixed $accountId): void {
    $proposal = sanitizeWith(sanitizerExtraction(['account_id' => $accountId]));

    expect($proposal->values['account_id'])->toBe(SANITIZE_DEFAULT_ACCOUNT)
        ->and($proposal->fieldSources['account_id'])->toBe('default')
        ->and($proposal->confidence['account_id'])->toBe(0.0)
        ->and($proposal->lowConfidenceFields)->toContain('account_id');
})->with([
    'unknown or archived account' => [404],
    'missing account' => [null],
]);

it('nulls amounts that are not a positive magnitude within the maximum', function (mixed $amount): void {
    $proposal = sanitizeWith(sanitizerExtraction(['amount_cents' => $amount]));

    expect($proposal->values['amount_cents'])->toBeNull()
        ->and($proposal->confidence['amount_cents'])->toBe(0.0)
        ->and($proposal->lowConfidenceFields)->toContain('amount_cents');
})->with([
    'negative' => [-2000],
    'zero' => [0],
    'above the maximum' => [99_999_999_99 + 1],
    'fractional' => [12.5],
    'text' => ['veinte'],
    'missing' => [null],
]);

it('accepts an integral float amount', function (): void {
    expect(sanitizeWith(sanitizerExtraction(['amount_cents' => 2000.0]))->values['amount_cents'])->toBe(2000);
});

it('moves a future date to today with confidence 0.3', function (): void {
    $proposal = sanitizeWith(sanitizerExtraction(['date' => '2026-10-20']));

    expect($proposal->values['date'])->toBe(SANITIZE_TODAY)
        ->and($proposal->confidence['date'])->toBe(0.3)
        ->and($proposal->lowConfidenceFields)->toContain('date');
});

it('keeps a future date on a transfer with a valid destination, flagged for review', function (): void {
    $proposal = sanitizeWith(sanitizerExtraction([
        'type' => 'transfer', 'account_id' => SANITIZE_DEFAULT_ACCOUNT, 'to_account_id' => SANITIZE_SAVINGS,
        'date' => '2026-10-30', 'confidence' => ['to_account_id' => 0.9],
    ]));

    expect($proposal->values)->toMatchArray(['type' => 'transfer', 'date' => '2026-10-30'])
        ->and($proposal->confidence['date'])->toBe(0.3)
        ->and($proposal->fieldSources['date'])->toBe('ai')
        ->and($proposal->lowConfidenceFields)->toBe(['date']);
});

it('keeps a transfer date exactly at the scheduling limit', function (): void {
    $limit = day(SANITIZE_TODAY)->addDays(366)->toDateString();

    $proposal = sanitizeWith(sanitizerExtraction([
        'type' => 'transfer', 'account_id' => SANITIZE_DEFAULT_ACCOUNT, 'to_account_id' => SANITIZE_SAVINGS, 'date' => $limit,
    ]));

    expect($proposal->values['date'])->toBe($limit);
});

it('moves a future date to today when the transfer cannot be kept', function (array $overrides): void {
    $proposal = sanitizeWith(sanitizerExtraction([
        'type' => 'transfer', 'account_id' => SANITIZE_DEFAULT_ACCOUNT, ...$overrides,
    ]));

    expect($proposal->values['date'])->toBe(SANITIZE_TODAY)
        ->and($proposal->confidence['date'])->toBe(0.3)
        ->and($proposal->lowConfidenceFields)->toContain('date');
})->with([
    'downgraded to expense' => [['to_account_id' => null, 'date' => '2026-10-30']],
    'beyond the scheduling limit' => [['to_account_id' => SANITIZE_SAVINGS, 'date' => '2027-10-15']],
]);

it('moves a future date on an income to today', function (): void {
    $proposal = sanitizeWith(sanitizerExtraction(['type' => 'income', 'category_id' => SANITIZE_SALARY, 'date' => '2026-10-30']));

    expect($proposal->values['date'])->toBe(SANITIZE_TODAY)
        ->and($proposal->lowConfidenceFields)->toContain('date');
});

it('defaults a missing date to today without flagging it', function (): void {
    $proposal = sanitizeWith(sanitizerExtraction(['date' => null]));

    expect($proposal->values['date'])->toBe(SANITIZE_TODAY)
        ->and($proposal->fieldSources['date'])->toBe('default')
        ->and($proposal->lowConfidenceFields)->not->toContain('date');
});

it('defaults an unparseable date to today and flags it', function (): void {
    $proposal = sanitizeWith(sanitizerExtraction(['date' => '2026-02-30']));

    expect($proposal->values['date'])->toBe(SANITIZE_TODAY)
        ->and($proposal->lowConfidenceFields)->toContain('date');
});

it('keeps a transfer with a valid destination and no category', function (): void {
    $proposal = sanitizeWith(sanitizerExtraction([
        'type' => 'transfer', 'account_id' => SANITIZE_DEFAULT_ACCOUNT, 'to_account_id' => SANITIZE_SAVINGS, 'category_id' => SANITIZE_GROCERIES,
        'confidence' => ['to_account_id' => 0.9],
    ]));

    expect($proposal->values)->toMatchArray([
        'type' => 'transfer', 'account_id' => SANITIZE_DEFAULT_ACCOUNT, 'to_account_id' => SANITIZE_SAVINGS, 'category_id' => null,
    ])
        ->and($proposal->lowConfidenceFields)->toBe([]);
});

it('turns a transfer without a valid destination into a flagged expense', function (mixed $destination): void {
    $proposal = sanitizeWith(sanitizerExtraction(['type' => 'transfer', 'to_account_id' => $destination]));

    expect($proposal->values['type'])->toBe('expense')
        ->and($proposal->values['to_account_id'])->toBeNull()
        ->and($proposal->values['category_id'])->toBe(SANITIZE_GROCERIES)
        ->and($proposal->lowConfidenceFields)->toContain('type');
})->with([
    'missing destination' => [null],
    'unknown destination' => [404],
    'same account' => [SANITIZE_VISA],
]);

it('drops the category, flagged, when its kind conflicts with the type', function (): void {
    $proposal = sanitizeWith(sanitizerExtraction(['type' => 'income', 'category_id' => SANITIZE_GROCERIES]));

    expect($proposal->values['type'])->toBe('income')
        ->and($proposal->values['category_id'])->toBeNull()
        ->and($proposal->lowConfidenceFields)->toBe(['category_id']);
});

it('defaults an unknown type to a flagged expense', function (): void {
    $proposal = sanitizeWith(sanitizerExtraction(['type' => 'refund']));

    expect($proposal->values['type'])->toBe('expense')
        ->and($proposal->fieldSources['type'])->toBe('default')
        ->and($proposal->lowConfidenceFields)->toContain('type');
});

it('flags fields whose confidence is below the threshold', function (): void {
    $proposal = sanitizeWith(sanitizerExtraction(['confidence' => ['category_id' => 0.55, 'merchant' => 0.69, 'date' => 0.7]]));

    expect($proposal->lowConfidenceFields)->toBe(['category_id', 'merchant'])
        ->and($proposal->confidence['category_id'])->toBe(0.55);
});

it('treats a missing or out of range confidence as zero or clamps it', function (): void {
    $proposal = sanitizeWith(sanitizerExtraction(['confidence' => ['amount_cents' => 'high', 'merchant' => 7]]));

    expect($proposal->confidence['amount_cents'])->toBe(0.0)
        ->and($proposal->confidence['merchant'])->toBe(1.0)
        ->and($proposal->lowConfidenceFields)->toContain('amount_cents')
        ->and($proposal->lowConfidenceFields)->not->toContain('merchant');
});

it('trims texts and truncates them to the column sizes', function (): void {
    $proposal = sanitizeWith(sanitizerExtraction(['description' => '  '.str_repeat('a', 300).'  ', 'merchant' => '   ']));

    expect(mb_strlen((string) $proposal->values['description']))->toBe(255)
        ->and($proposal->values['merchant'])->toBeNull()
        ->and($proposal->lowConfidenceFields)->not->toContain('merchant');
});

it('builds a usable draft from defaults and the transcript when the provider failed', function (): void {
    $proposal = sanitizeWith(null, transcript: 'Veinte euros en Mercadona');

    expect($proposal->values)->toBe([
        'type' => 'expense',
        'amount_cents' => null,
        'date' => SANITIZE_TODAY,
        'account_id' => SANITIZE_DEFAULT_ACCOUNT,
        'to_account_id' => null,
        'category_id' => null,
        'description' => 'Veinte euros en Mercadona',
        'merchant' => null,
    ])
        ->and($proposal->fieldSources)->toMatchArray(['type' => 'default', 'date' => 'default', 'account_id' => 'default'])
        ->and($proposal->lowConfidenceFields)->toBe(['amount_cents', 'category_id', 'description', 'merchant']);
});

it('leaves the account empty when there is no default account', function (): void {
    $proposal = sanitizeWith(sanitizerExtraction(['account_id' => null]), defaultAccountId: null);

    expect($proposal->values['account_id'])->toBeNull()
        ->and($proposal->lowConfidenceFields)->toContain('account_id');
});
