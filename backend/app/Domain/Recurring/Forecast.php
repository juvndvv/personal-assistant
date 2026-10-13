<?php

declare(strict_types=1);

namespace App\Domain\Recurring;

use App\Domain\Period\Period;
use App\Enums\ForecastStatus;
use App\Enums\RecurringType;

final readonly class Forecast
{
    /**
     * @param  list<ForecastItem>  $items
     */
    public function __construct(
        public Period $period,
        public array $items,
    ) {}

    public function pendingCents(RecurringType $type): int
    {
        return $this->sum($type, fn (ForecastItem $item): bool => $item->status->isPending());
    }

    public function postedCents(RecurringType $type): int
    {
        return $this->sum($type, fn (ForecastItem $item): bool => $item->status === ForecastStatus::Posted);
    }

    /**
     * @param  callable(ForecastItem): bool  $included
     */
    private function sum(RecurringType $type, callable $included): int
    {
        $total = 0;

        foreach ($this->items as $item) {
            if ($item->type === $type && $included($item)) {
                $total += $item->amountCents;
            }
        }

        return $total;
    }
}
