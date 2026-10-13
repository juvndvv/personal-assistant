<?php

declare(strict_types=1);

namespace App\Enums;

enum TransactionOrigin: string
{
    case Manual = 'manual';
    case Voice = 'voice';
    case Photo = 'photo';
    case Recurring = 'recurring';
}
