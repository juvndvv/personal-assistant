<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\AccountType;
use App\Models\Account;
use Closure;
use Illuminate\Validation\Rule;

final class AccountRules
{
    public const int MAX_MAGNITUDE_CENTS = 99_999_999_99;

    public static function uniqueName(?int $ignoreAccountId = null): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) use ($ignoreAccountId): void {
            if (! is_string($value)) {
                return;
            }

            $taken = Account::query()
                ->whereRaw('lower(name) = lower(?)', [trim($value)])
                ->when($ignoreAccountId !== null, fn ($query) => $query->whereKeyNot($ignoreAccountId))
                ->exists();

            if ($taken) {
                $fail('Ya existe una cuenta con ese nombre.');
            }
        };
    }

    public static function settlementAccount(?int $ignoreAccountId = null): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) use ($ignoreAccountId): void {
            if ($value === null) {
                return;
            }

            $account = is_numeric($value) ? Account::query()->find((int) $value) : null;

            if ($account === null || $account->id === $ignoreAccountId) {
                $fail('La cuenta de liquidación no es válida.');

                return;
            }

            if ($account->type === AccountType::CreditCard) {
                $fail('La cuenta de liquidación no puede ser una tarjeta de crédito.');

                return;
            }

            if ($account->isArchived()) {
                $fail('La cuenta de liquidación está archivada.');
            }
        };
    }

    /**
     * @return list<mixed>
     */
    public static function signedCents(bool $required): array
    {
        return [
            $required ? 'required' : 'sometimes',
            'integer',
            'between:'.-self::MAX_MAGNITUDE_CENTS.','.self::MAX_MAGNITUDE_CENTS,
        ];
    }

    /**
     * @return list<mixed>
     */
    public static function type(bool $required): array
    {
        return [$required ? 'required' : 'sometimes', Rule::enum(AccountType::class)];
    }
}
