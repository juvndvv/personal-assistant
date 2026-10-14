<?php

declare(strict_types=1);

namespace App\Reports;

enum BudgetStatus: string
{
    case Ok = 'ok';
    case Warning = 'warning';
    case Over = 'over';

    private const int WARNING_PERCENT = 80;

    public static function of(int $actualCents, int $budgetCents): self
    {
        return match (true) {
            $actualCents > $budgetCents => self::Over,
            $actualCents * 100 >= $budgetCents * self::WARNING_PERCENT => self::Warning,
            default => self::Ok,
        };
    }
}
