<?php

declare(strict_types=1);

namespace App\Domain\Recurring;

use Carbon\CarbonImmutable;

final readonly class RecurrenceSlot
{
    public function __construct(
        public string $slotMonth,
        public CarbonImmutable $dueDate,
    ) {}
}
