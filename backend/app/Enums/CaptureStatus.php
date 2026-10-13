<?php

declare(strict_types=1);

namespace App\Enums;

enum CaptureStatus: string
{
    case Processing = 'processing';
    case Completed = 'completed';
    case Failed = 'failed';
}
