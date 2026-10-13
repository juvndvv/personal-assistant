<?php

declare(strict_types=1);

namespace App\Enums;

enum DraftStatus: string
{
    case Pending = 'pending';
    case Confirmed = 'confirmed';
    case Discarded = 'discarded';
}
