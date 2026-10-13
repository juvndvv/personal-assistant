<?php

declare(strict_types=1);

namespace App\Enums;

enum RecurringType: string
{
    case Expense = 'expense';
    case Income = 'income';

    public function transactionType(): TransactionType
    {
        return match ($this) {
            self::Expense => TransactionType::Expense,
            self::Income => TransactionType::Income,
        };
    }

    public function draftType(): DraftType
    {
        return match ($this) {
            self::Expense => DraftType::Expense,
            self::Income => DraftType::Income,
        };
    }

    public function categoryKind(): CategoryKind
    {
        return match ($this) {
            self::Expense => CategoryKind::Expense,
            self::Income => CategoryKind::Income,
        };
    }

    public function signedCents(int $magnitudeCents): int
    {
        return $this === self::Expense ? -$magnitudeCents : $magnitudeCents;
    }
}
