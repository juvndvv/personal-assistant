<?php

declare(strict_types=1);

namespace App\Domain\Cards;

use Carbon\CarbonImmutable;

final readonly class StatementWindow
{
    public function __construct(public CarbonImmutable $start, public CarbonImmutable $end) {}

    public static function lastClosedOn(int $statementDay, CarbonImmutable $date): self
    {
        $date = $date->startOfDay();
        $end = $date->day >= $statementDay
            ? $date->setDay($statementDay)
            : $date->startOfMonth()->subMonthNoOverflow()->setDay($statementDay);
        $previousEnd = $end->startOfMonth()->subMonthNoOverflow()->setDay($statementDay);

        return new self($previousEnd->addDay(), $end);
    }
}
