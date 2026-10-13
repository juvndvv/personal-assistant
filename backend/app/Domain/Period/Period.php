<?php

declare(strict_types=1);

namespace App\Domain\Period;

use Carbon\CarbonImmutable;

final readonly class Period
{
    public function __construct(
        public string $label,
        public CarbonImmutable $start,
        public CarbonImmutable $end,
        public int $monthStartDay,
    ) {}

    public function contains(CarbonImmutable $date): bool
    {
        $day = $date->toDateString();

        return $day >= $this->start->toDateString() && $day <= $this->end->toDateString();
    }

    public function equals(self $other): bool
    {
        return $this->label === $other->label && $this->monthStartDay === $other->monthStartDay;
    }
}
