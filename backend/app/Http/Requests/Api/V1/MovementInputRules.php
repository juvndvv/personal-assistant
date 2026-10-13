<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Domain\Ledger\MovementRules;
use App\Domain\Tags\TagName;
use Carbon\CarbonImmutable;
use Closure;

final class MovementInputRules
{
    public const int MAX_TAGS = 10;

    /**
     * @return list<mixed>
     */
    public static function magnitudeCents(bool $required): array
    {
        return [$required ? 'required' : 'sometimes', 'integer', 'between:1,'.MovementRules::MAX_MAGNITUDE_CENTS];
    }

    /**
     * @return list<mixed>
     */
    public static function date(bool $nullable = true): array
    {
        return $nullable
            ? ['sometimes', 'nullable', 'date_format:Y-m-d']
            : ['sometimes', 'date_format:Y-m-d'];
    }

    /**
     * @return array<string, list<mixed>>
     */
    public static function texts(): array
    {
        return [
            'description' => ['sometimes', 'nullable', 'string', 'max:255', self::validUtf8()],
            'merchant' => ['sometimes', 'nullable', 'string', 'max:120', self::validUtf8()],
            'note' => ['sometimes', 'nullable', 'string', 'max:1000', self::validUtf8()],
        ];
    }

    /**
     * @return array<string, list<mixed>>
     */
    public static function tags(): array
    {
        return [
            'tags' => ['sometimes', 'array', 'max:'.self::MAX_TAGS],
            'tags.*' => ['string', 'min:1', 'max:'.TagName::MAX_LENGTH, self::validUtf8()],
        ];
    }

    /**
     * @return list<mixed>
     */
    public static function draftId(): array
    {
        return ['sometimes', 'nullable', 'integer', function (string $attribute, mixed $value, Closure $fail): void {
            if ($value !== null) {
                $fail('El borrador no existe o ya no está pendiente.');
            }
        }];
    }

    public static function validUtf8(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail): void {
            if (is_string($value) && ! mb_check_encoding($value, 'UTF-8')) {
                $fail('El texto contiene caracteres no válidos.');
            }
        };
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function normalizeTags(array $input): array
    {
        if (! isset($input['tags']) || ! is_array($input['tags'])) {
            return [];
        }

        return ['tags' => array_map(
            fn (mixed $tag): mixed => is_string($tag) ? TagName::normalize($tag) : $tag,
            $input['tags'],
        )];
    }

    public static function parseDate(mixed $value): ?CarbonImmutable
    {
        return is_string($value) ? CarbonImmutable::createFromFormat('!Y-m-d', $value) ?: null : null;
    }

    public static function text(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
