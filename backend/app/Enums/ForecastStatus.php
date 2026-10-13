<?php

declare(strict_types=1);

namespace App\Enums;

enum ForecastStatus: string
{
    case Upcoming = 'upcoming';
    case AwaitingAmount = 'awaiting_amount';
    case Posted = 'posted';
    case Skipped = 'skipped';

    public function isPending(): bool
    {
        return $this === self::Upcoming || $this === self::AwaitingAmount;
    }
}
