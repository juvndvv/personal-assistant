<?php

declare(strict_types=1);

namespace App\Domain\Transactions;

use Carbon\CarbonImmutable;
use InvalidArgumentException;

final readonly class Changes
{
    /**
     * @param  array<string, mixed>  $values
     */
    public function __construct(private array $values) {}

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->values);
    }

    public function integer(string $key): ?int
    {
        $value = $this->values[$key] ?? null;

        return is_numeric($value) ? (int) $value : null;
    }

    public function text(string $key): ?string
    {
        $value = $this->values[$key] ?? null;

        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    public function date(string $key): ?CarbonImmutable
    {
        $value = $this->values[$key] ?? null;

        if ($value instanceof CarbonImmutable) {
            return $value->startOfDay();
        }

        if (! is_string($value)) {
            return null;
        }

        return CarbonImmutable::createFromFormat('!Y-m-d', $value)
            ?: throw new InvalidArgumentException("Invalid date for {$key}.");
    }

    /**
     * @return list<string>
     */
    public function strings(string $key): array
    {
        $value = $this->values[$key] ?? [];

        return is_array($value) ? array_values(array_filter($value, is_string(...))) : [];
    }
}
