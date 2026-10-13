<?php

declare(strict_types=1);

namespace App\Domain\Period;

use Carbon\CarbonImmutable;
use InvalidArgumentException;

final readonly class PeriodResolver
{
    public const int MIN_START_DAY = 1;

    public const int MAX_START_DAY = 28;

    private const int LAST_START_DAY_LABELLED_BY_START_MONTH = 15;

    private const string LABEL_PATTERN = '/^(\d{4})-(0[1-9]|1[0-2])$/';

    public function __construct(public int $monthStartDay)
    {
        if ($monthStartDay < self::MIN_START_DAY || $monthStartDay > self::MAX_START_DAY) {
            throw new InvalidArgumentException("Month start day must be between 1 and 28, got {$monthStartDay}.");
        }
    }

    public static function isValidLabel(string $label): bool
    {
        return preg_match(self::LABEL_PATTERN, $label) === 1;
    }

    public function forDate(CarbonImmutable $date): Period
    {
        $monthOfStart = $date->startOfMonth();

        if ($date->day < $this->monthStartDay) {
            $monthOfStart = $monthOfStart->subMonthNoOverflow();
        }

        return $this->periodStartingIn($monthOfStart);
    }

    public function fromLabel(string $label): Period
    {
        if (preg_match(self::LABEL_PATTERN, $label, $matches) !== 1) {
            throw new InvalidArgumentException("Invalid period label \"{$label}\"; expected YYYY-MM.");
        }

        $labelMonth = CarbonImmutable::create((int) $matches[1], (int) $matches[2], 1)?->startOfDay()
            ?? throw new InvalidArgumentException("Invalid period label \"{$label}\".");

        $monthOfStart = $this->isLabelledByStartMonth() ? $labelMonth : $labelMonth->subMonthNoOverflow();

        return $this->periodStartingIn($monthOfStart);
    }

    public function current(): Period
    {
        return $this->forDate(CarbonImmutable::today());
    }

    public function next(Period $period): Period
    {
        return $this->forDate($period->end->addDay());
    }

    public function previous(Period $period): Period
    {
        return $this->forDate($period->start->subDay());
    }

    /**
     * @return list<Period>
     */
    public function lastN(int $count, ?Period $until = null): array
    {
        if ($count < 1) {
            throw new InvalidArgumentException("Period count must be at least 1, got {$count}.");
        }

        $period = $until ?? $this->current();
        $periods = [$period];

        for ($index = 1; $index < $count; $index++) {
            $period = $this->previous($period);
            $periods[] = $period;
        }

        return array_reverse($periods);
    }

    private function periodStartingIn(CarbonImmutable $monthOfStart): Period
    {
        $start = $monthOfStart->startOfMonth()->setDay($this->monthStartDay);
        $end = $start->addMonthNoOverflow()->subDay();
        $labelMonth = $this->isLabelledByStartMonth() ? $start : $start->startOfMonth()->addMonthNoOverflow();

        return new Period($labelMonth->format('Y-m'), $start, $end, $this->monthStartDay);
    }

    private function isLabelledByStartMonth(): bool
    {
        return $this->monthStartDay <= self::LAST_START_DAY_LABELLED_BY_START_MONTH;
    }
}
