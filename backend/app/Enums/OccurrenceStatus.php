<?php

declare(strict_types=1);

namespace App\Enums;

enum OccurrenceStatus: string
{
    case Posted = 'posted';
    case AwaitingAmount = 'awaiting_amount';
    case Skipped = 'skipped';
}
