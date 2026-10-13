<?php

declare(strict_types=1);

namespace App\Ai;

use App\Domain\Ledger\MovementRules;
use Carbon\CarbonImmutable;

final class SanitizeExtraction
{
    public const string SOURCE_AI = 'ai';

    public const string SOURCE_DEFAULT = 'default';

    public const float FUTURE_DATE_CONFIDENCE = 0.3;

    private const array TYPES = ['expense', 'income', 'transfer'];

    private const int DESCRIPTION_MAX = 255;

    private const int MERCHANT_MAX = 120;

    /**
     * @var array<string, int|string|null>
     */
    private array $values = [];

    /**
     * @var array<string, float>
     */
    private array $confidence = [];

    /**
     * @var array<string, string>
     */
    private array $sources = [];

    /**
     * @var array<string, true>
     */
    private array $flagged = [];

    public function handle(
        ExtractionResult $result,
        ExtractionCatalog $catalog,
        CarbonImmutable $today,
        ?int $defaultAccountId,
    ): DraftProposal {
        $this->values = [
            'type' => null, 'amount_cents' => null, 'date' => null, 'account_id' => null,
            'to_account_id' => null, 'category_id' => null, 'description' => null, 'merchant' => null,
        ];
        $this->confidence = [];
        $this->sources = [];
        $this->flagged = [];

        if (! $result->successful || $result->extraction === null) {
            $this->fallback($result->transcript, $today, $defaultAccountId);
        } else {
            $this->sanitize($result->extraction, $catalog, $today, $defaultAccountId);
        }

        return new DraftProposal(
            values: [
                'type' => $this->string('type'),
                'amount_cents' => $this->integerValue('amount_cents'),
                'date' => $this->string('date'),
                'account_id' => $this->integerValue('account_id'),
                'to_account_id' => $this->integerValue('to_account_id'),
                'category_id' => $this->integerValue('category_id'),
                'description' => $this->string('description'),
                'merchant' => $this->string('merchant'),
            ],
            confidence: $this->confidence,
            fieldSources: $this->sources,
            lowConfidenceFields: array_values(array_filter(
                array_keys($this->values),
                fn (string $field): bool => isset($this->flagged[$field]),
            )),
        );
    }

    private function fallback(?string $transcript, CarbonImmutable $today, ?int $defaultAccountId): void
    {
        $this->set('type', 'expense', 0.0, self::SOURCE_DEFAULT, flagged: false);
        $this->set('date', $today->toDateString(), 1.0, self::SOURCE_DEFAULT, flagged: false);

        if ($defaultAccountId !== null) {
            $this->set('account_id', $defaultAccountId, 0.0, self::SOURCE_DEFAULT, flagged: false);
        }

        $this->reject('amount_cents');
        $this->reject('category_id');
        $this->reject('merchant');

        $description = self::text($transcript, self::DESCRIPTION_MAX);

        if ($description === null) {
            $this->reject('description');
        } else {
            $this->set('description', $description, 0.0, self::SOURCE_AI, flagged: true);
        }
    }

    /**
     * @param  array<string, mixed>  $raw
     */
    private function sanitize(array $raw, ExtractionCatalog $catalog, CarbonImmutable $today, ?int $defaultAccountId): void
    {
        $confidence = is_array($raw['confidence'] ?? null) ? $raw['confidence'] : [];
        $score = fn (string $field): float => self::score($confidence[$field] ?? null);

        $type = $raw['type'] ?? null;

        if (is_string($type) && in_array($type, self::TYPES, true)) {
            $this->accept('type', $type, $score('type'));
        } else {
            $this->set('type', 'expense', 0.0, self::SOURCE_DEFAULT, flagged: true);
        }

        $amount = self::integer($raw['amount_cents'] ?? null);

        if ($amount !== null && $amount > 0 && $amount <= MovementRules::MAX_MAGNITUDE_CENTS) {
            $this->accept('amount_cents', $amount, $score('amount_cents'));
        } else {
            $this->reject('amount_cents');
        }

        $this->sanitizeDate($raw['date'] ?? null, $score('date'), $today);

        $accountIds = $catalog->accountIds();
        $accountId = self::integer($raw['account_id'] ?? null);

        if ($accountId !== null && in_array($accountId, $accountIds, true)) {
            $this->accept('account_id', $accountId, $score('account_id'));
        } elseif ($defaultAccountId !== null) {
            $this->set('account_id', $defaultAccountId, 0.0, self::SOURCE_DEFAULT, flagged: true);
        } else {
            $this->reject('account_id');
        }

        $toAccountId = self::integer($raw['to_account_id'] ?? null);
        $validDestination = $toAccountId !== null
            && in_array($toAccountId, $accountIds, true)
            && $toAccountId !== $this->values['account_id'];

        if ($this->values['type'] === 'transfer') {
            if ($validDestination) {
                $this->accept('to_account_id', $toAccountId, $score('to_account_id'));
            } else {
                $this->set('type', 'expense', 0.0, self::SOURCE_AI, flagged: true);
                $this->reject('to_account_id', flagged: false);
            }
        }

        $this->sanitizeCategory(self::integer($raw['category_id'] ?? null), $score('category_id'), $catalog);

        $this->sanitizeText('description', $raw['description'] ?? null, $score('description'), self::DESCRIPTION_MAX);
        $this->sanitizeText('merchant', $raw['merchant'] ?? null, $score('merchant'), self::MERCHANT_MAX);
    }

    private function sanitizeDate(mixed $date, float $confidence, CarbonImmutable $today): void
    {
        if ($date === null || $date === '') {
            $this->set('date', $today->toDateString(), 1.0, self::SOURCE_DEFAULT, flagged: false);

            return;
        }

        $parsed = is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1
            ? CarbonImmutable::createFromFormat('!Y-m-d', $date)
            : null;

        if (! $parsed instanceof CarbonImmutable || $parsed->toDateString() !== $date) {
            $this->set('date', $today->toDateString(), 0.0, self::SOURCE_DEFAULT, flagged: true);

            return;
        }

        if ($parsed->greaterThan($today)) {
            $this->set('date', $today->toDateString(), self::FUTURE_DATE_CONFIDENCE, self::SOURCE_AI, flagged: true);

            return;
        }

        $this->accept('date', $parsed->toDateString(), $confidence);
    }

    private function sanitizeCategory(?int $categoryId, float $confidence, ExtractionCatalog $catalog): void
    {
        $type = $this->values['type'];

        if ($type === 'transfer') {
            return;
        }

        if ($categoryId === null || $catalog->categoryKind($categoryId) !== $type) {
            $this->reject('category_id');

            return;
        }

        $this->accept('category_id', $categoryId, $confidence);
    }

    private function sanitizeText(string $field, mixed $value, float $confidence, int $max): void
    {
        $text = self::text($value, $max);

        if ($text === null) {
            return;
        }

        $this->accept($field, $text, $confidence);
    }

    private function accept(string $field, int|string $value, float $confidence): void
    {
        $this->set($field, $value, $confidence, self::SOURCE_AI, flagged: $confidence < self::threshold());
    }

    private function reject(string $field, bool $flagged = true): void
    {
        $this->values[$field] = null;
        $this->confidence[$field] = 0.0;
        unset($this->sources[$field]);

        if ($flagged) {
            $this->flagged[$field] = true;
        } else {
            unset($this->flagged[$field]);
        }
    }

    private function set(string $field, int|string $value, float $confidence, string $source, bool $flagged): void
    {
        $this->values[$field] = $value;
        $this->confidence[$field] = $confidence;
        $this->sources[$field] = $source;

        if ($flagged) {
            $this->flagged[$field] = true;
        } else {
            unset($this->flagged[$field]);
        }
    }

    private function string(string $field): ?string
    {
        $value = $this->values[$field] ?? null;

        return is_string($value) ? $value : null;
    }

    private function integerValue(string $field): ?int
    {
        $value = $this->values[$field] ?? null;

        return is_int($value) ? $value : null;
    }

    public static function threshold(): float
    {
        $value = config('finance.capture.low_confidence_threshold');

        return is_numeric($value) ? (float) $value : 0.7;
    }

    private static function score(mixed $value): float
    {
        return is_int($value) || is_float($value) ? max(0.0, min(1.0, (float) $value)) : 0.0;
    }

    private static function integer(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }

        if (is_float($value) && is_finite($value) && floor($value) === $value && abs($value) <= PHP_INT_MAX) {
            return (int) $value;
        }

        if (is_string($value) && preg_match('/^-?\d{1,18}$/', $value) === 1) {
            return (int) $value;
        }

        return null;
    }

    private static function text(mixed $value, int $max): ?string
    {
        if (! is_string($value) || ! mb_check_encoding($value, 'UTF-8')) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : rtrim(mb_substr($trimmed, 0, $max));
    }
}
