<?php

declare(strict_types=1);

namespace App\Domain\Recurring;

use App\Enums\ForecastStatus;
use App\Enums\RecurringType;
use Carbon\CarbonImmutable;

final readonly class ForecastItem
{
    public function __construct(
        public int $templateId,
        public string $templateName,
        public RecurringType $type,
        public CarbonImmutable $dueDate,
        public int $amountCents,
        public bool $isVariable,
        public ForecastStatus $status,
        public ?int $draftId = null,
        public ?int $transactionId = null,
    ) {}
}
