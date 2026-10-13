<?php

declare(strict_types=1);

namespace App\Reports;

use App\Domain\Period\Period;

final readonly class CaptureMetrics
{
    public function __construct(
        public Period $period,
        public int $capturesConfirmed,
        public ?int $medianMillisecondsToConfirm,
        public ?int $p90MillisecondsToConfirm,
        public int $capturesUnedited,
        public int $activeDays,
        public int $elapsedDays,
    ) {}

    public function uneditedShareBp(): ?int
    {
        return BasisPoints::ratio($this->capturesUnedited, $this->capturesConfirmed);
    }
}
