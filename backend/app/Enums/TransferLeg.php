<?php

declare(strict_types=1);

namespace App\Enums;

enum TransferLeg: string
{
    case Out = 'out';
    case In = 'in';
}
