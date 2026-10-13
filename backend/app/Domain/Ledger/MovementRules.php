<?php

declare(strict_types=1);

namespace App\Domain\Ledger;

use App\Enums\CategoryKind;
use App\Models\Account;
use App\Models\Category;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

final class MovementRules
{
    public const int MAX_MAGNITUDE_CENTS = 99_999_999_99;

    public const int MAX_DAYS_IN_FUTURE = 366;

    public function writableAccount(int $accountId, string $field = 'account_id'): Account
    {
        $account = Account::query()->find($accountId);

        if ($account === null) {
            throw ValidationException::withMessages([$field => 'La cuenta no existe.']);
        }

        $this->ensureWritable($account, $field);

        return $account;
    }

    public function ensureWritable(Account $account, string $field = 'account_id'): void
    {
        if ($account->trashed() || $account->isArchived()) {
            throw ValidationException::withMessages([$field => 'La cuenta está archivada y no admite movimientos.']);
        }
    }

    public function ensureDateAllowed(Account $account, CarbonImmutable $date, string $field = 'date'): void
    {
        if ($date->lessThan($account->opening_date)) {
            throw ValidationException::withMessages([
                $field => 'La fecha no puede ser anterior a la fecha de apertura de la cuenta.',
            ]);
        }

        if ($date->greaterThan(CarbonImmutable::today()->addDays(self::MAX_DAYS_IN_FUTURE))) {
            throw ValidationException::withMessages([
                $field => 'La fecha no puede estar más de un año en el futuro.',
            ]);
        }
    }

    public function usableCategory(int $categoryId, CategoryKind $kind, string $field = 'category_id'): Category
    {
        $category = Category::query()->with('parent')->find($categoryId);

        if ($category === null) {
            throw ValidationException::withMessages([$field => 'La categoría no existe.']);
        }

        if ($category->kind !== $kind) {
            throw ValidationException::withMessages([
                $field => $kind === CategoryKind::Expense
                    ? 'La categoría debe ser de gastos.'
                    : 'La categoría debe ser de ingresos.',
            ]);
        }

        if ($category->isArchived() || $category->parent?->isArchived() === true) {
            throw ValidationException::withMessages([$field => 'La categoría está archivada.']);
        }

        return $category;
    }
}
